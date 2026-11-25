package com.bharata.astras

import android.content.Context
import android.net.wifi.WifiManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Offline Wi-Fi Hotspot / Local LAN Multiplayer Engine (2 to 6 players, zero internet required).
 * Runs a native TCP game server + UDP hotspot discovery responder on Host devices,
 * and native TCP client + UDP probe listener on Guest devices.
 */
class LanMultiplayerManager(
    private val context: Context,
    private val onEventJson: (String) -> Unit
) {

    private data class PeerPlayer(
        val id: String,
        var name: String,
        var heroId: String,
        var accentHex: String,
        val isHost: Boolean,
        var ready: Boolean,
        val slotIndex: Int,
        val socket: Socket?,
        val out: DataOutputStream?,
        val writeLock: Any = Any()
    )

    private val runningHost = AtomicBoolean(false)
    private val runningClient = AtomicBoolean(false)
    private val runningDiscovery = AtomicBoolean(false)

    @Volatile
    private var serverSocket: ServerSocket? = null
    @Volatile
    private var clientSocket: Socket? = null
    @Volatile
    private var clientOut: DataOutputStream? = null
    private val clientWriteLock = Any()

    @Volatile
    private var beaconSocket: DatagramSocket? = null
    @Volatile
    private var discoverySocket: DatagramSocket? = null
    private var multicastLock: WifiManager.MulticastLock? = null

    private var sendExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    private val peers = ConcurrentHashMap<String, PeerPlayer>()
    @Volatile
    private var currentRoomId: String = ""
    @Volatile
    private var currentRoomName: String = "Ayodhya Sabha"
    @Volatile
    private var currentRoomCode: String = "1008"
    @Volatile
    private var currentSessionStarted: Boolean = false
    @Volatile
    private var localPlayerId: String = "host"

    fun getNetworkInfoJson(): String {
        val ips = mutableListOf<String>()
        val broadcasts = mutableListOf<String>()
        try {
            val ifaces = NetworkInterface.getNetworkInterfaces()
            val prioritized = mutableListOf<Pair<Int, String>>()
            while (ifaces != null && ifaces.hasMoreElements()) {
                val nif = ifaces.nextElement()
                if (!nif.isUp || nif.isLoopback) continue
                val nName = nif.name.lowercase()
                val prio = when {
                    nName.contains("ap") || nName.contains("swlan") -> 0
                    nName.contains("wlan") -> 1
                    else -> 2
                }
                for (ia in nif.interfaceAddresses) {
                    val addr = ia.address
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val hostAddr = addr.hostAddress ?: continue
                        prioritized.add(prio to hostAddr)
                        ia.broadcast?.hostAddress?.let { b ->
                            if (!broadcasts.contains(b)) broadcasts.add(b)
                        }
                    }
                }
            }
            prioritized.sortedBy { it.first }.forEach { (_, ip) ->
                if (!ips.contains(ip)) ips.add(ip)
            }
        } catch (_: Exception) {
            // Ignore interface enumeration errors
        }

        val primaryIp = ips.firstOrNull() ?: "127.0.0.1"
        val guessedGateway = guessGatewayIp(ips)

        val root = JSONObject()
        root.put("primaryIp", primaryIp)
        root.put("suggestedHostIp", guessedGateway)
        root.put("port", TCP_PORT)
        root.put("ips", JSONArray(ips))
        root.put("broadcasts", JSONArray(broadcasts))
        return root.toString()
    }

    private fun guessGatewayIp(localIps: List<String>): String {
        try {
            val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            @Suppress("DEPRECATION")
            val dhcp = wm?.dhcpInfo
            if (dhcp != null && dhcp.gateway != 0) {
                val gw = dhcp.gateway
                val formatted = String.format(
                    "%d.%d.%d.%d",
                    gw and 0xff,
                    (gw shr 8) and 0xff,
                    (gw shr 16) and 0xff,
                    (gw shr 24) and 0xff
                )
                if (formatted != "0.0.0.0") return formatted
            }
        } catch (_: Exception) {
            // Ignore fallback
        }
        val first = localIps.firstOrNull()
        if (first != null && first.contains('.')) {
            val prefix = first.substringBeforeLast('.')
            return "$prefix.1"
        }
        return "192.168.43.1"
    }

    fun startHost(roomName: String, hostName: String, roomCode: String, heroId: String) {
        stopAll()
        ensureExecutor()

        val cleanRoomName = sanitizeText(roomName, "Ayodhya Sabha", 20)
        val cleanHostName = sanitizeText(hostName, "Lord Ram", 18)
        val cleanCode = roomCode.replace(Regex("[^a-zA-Z0-9]"), "").uppercase().take(6).ifEmpty { "1008" }
        val cleanHero = heroId.ifBlank { "RAM" }

        currentRoomId = "room_" + UUID.randomUUID().toString().take(8)
        currentRoomName = cleanRoomName
        currentRoomCode = cleanCode
        currentSessionStarted = false
        localPlayerId = "host"

        peers.clear()
        peers["host"] = PeerPlayer(
            id = "host",
            name = cleanHostName,
            heroId = cleanHero,
            accentHex = accentForHero(cleanHero),
            isHost = true,
            ready = true,
            slotIndex = 0,
            socket = null,
            out = null
        )

        runningHost.set(true)
        acquireMulticastLock()

        Thread({
            try {
                val srv = ServerSocket()
                srv.reuseAddress = true
                srv.bind(InetSocketAddress(TCP_PORT))
                serverSocket = srv

                // Notify local JS host immediately
                val welcome = JSONObject().apply {
                    put("type", "WELCOME")
                    put("roomId", currentRoomId)
                    put("roomName", currentRoomName)
                    put("roomCode", currentRoomCode)
                    put("hostId", "host")
                    put("yourPlayerId", "host")
                    put("sessionStarted", false)
                    put("players", buildPlayersJsonArray())
                }
                emitWireMessage(welcome.toString())

                while (runningHost.get()) {
                    val client = try {
                        srv.accept()
                    } catch (_: Exception) {
                        break
                    }
                    client.tcpNoDelay = true
                    Thread({ handleIncomingTcpClient(client) }, "LanHostPeer").apply {
                        isDaemon = true
                        start()
                    }
                }
            } catch (e: Exception) {
                emitStatusError("HOST_BIND_FAILED", e.message ?: "Could not open hotspot room port.")
            }
        }, "LanHostAccept").apply {
            isDaemon = true
            start()
        }

        startUdpBeaconThread()
    }

    private fun handleIncomingTcpClient(socket: Socket) {
        var assignedPlayerId: String? = null
        try {
            val input = DataInputStream(BufferedInputStream(socket.getInputStream()))
            val output = DataOutputStream(BufferedOutputStream(socket.getOutputStream()))

            // First message must be HELLO
            val firstJson = readFrame(input) ?: return
            val hello = JSONObject(firstJson)
            if (hello.optString("type") != "HELLO") {
                sendFrameRaw(output, JSONObject().apply {
                    put("type", "ERROR")
                    put("code", "BAD_HANDSHAKE")
                    put("message", "Expected HELLO handshake.")
                }.toString())
                return
            }

            val code = hello.optString("roomCode", "").replace(Regex("[^a-zA-Z0-9]"), "").uppercase()
            if (code != currentRoomCode) {
                sendFrameRaw(output, JSONObject().apply {
                    put("type", "ERROR")
                    put("code", "BAD_CODE")
                    put("message", "Incorrect Room PIN.")
                }.toString())
                return
            }

            var assignedPeer: PeerPlayer? = null
            synchronized(peers) {
                if (peers.size >= MAX_PLAYERS) {
                    sendFrameRaw(output, JSONObject().apply {
                        put("type", "ERROR")
                        put("code", "ROOM_FULL")
                        put("message", "Room is full ($MAX_PLAYERS/$MAX_PLAYERS).")
                    }.toString())
                    return
                }
                val usedSlots = peers.values.map { it.slotIndex }.toSet()
                var freeSlot = 1
                while (usedSlots.contains(freeSlot)) freeSlot++

                val pid = "p_" + UUID.randomUUID().toString().take(8)
                val pName = sanitizeText(hello.optString("playerName"), "Warrior ${freeSlot + 1}", 18)
                val hero = hello.optString("heroId", "LAKSHMAN").ifBlank { "LAKSHMAN" }
                val peer = PeerPlayer(
                    id = pid,
                    name = pName,
                    heroId = hero,
                    accentHex = accentForHero(hero),
                    isHost = false,
                    ready = currentSessionStarted,
                    slotIndex = freeSlot,
                    socket = socket,
                    out = output
                )
                peers[pid] = peer
                assignedPeer = peer
                assignedPlayerId = pid
            }

            val peer = assignedPeer ?: return
            val welcomeStr = JSONObject().apply {
                put("type", "WELCOME")
                put("roomId", currentRoomId)
                put("roomName", currentRoomName)
                put("roomCode", currentRoomCode)
                put("hostId", "host")
                put("yourPlayerId", peer.id)
                put("sessionStarted", currentSessionStarted)
                put("players", buildPlayersJsonArray())
            }.toString()
            synchronized(peer.writeLock) {
                sendFrameRaw(output, welcomeStr)
            }
            broadcastLobbyUpdate()

            while (runningHost.get()) {
                val frame = readFrame(input) ?: break
                handleHostReceivedFrame(peer.id, frame)
            }
        } catch (_: Exception) {
            // Peer disconnected
        } finally {
            assignedPlayerId?.let { pid ->
                peers.remove(pid)
                if (runningHost.get()) {
                    broadcastLobbyUpdate()
                }
            }
            try {
                socket.close()
            } catch (_: Exception) {
            }
        }
    }

    private fun handleHostReceivedFrame(senderId: String, rawJson: String) {
        val msg = try {
            JSONObject(rawJson)
        } catch (_: Exception) {
            return
        }
        when (msg.optString("type")) {
            "PING" -> {
                val pong = JSONObject().apply {
                    put("type", "PONG")
                    put("ts", msg.optLong("ts"))
                    put("serverTimeMs", System.currentTimeMillis())
                }.toString()
                sendToPeer(senderId, pong)
            }
            "LEAVE" -> {
                peers.remove(senderId)?.socket?.let {
                    try { it.close() } catch (_: Exception) {}
                }
                broadcastLobbyUpdate()
            }
            "PLAYER_READY" -> {
                peers[senderId]?.let {
                    it.ready = msg.optBoolean("ready", false)
                    broadcastLobbyUpdate()
                }
            }
            "PLAYER_STATE" -> {
                val state = msg.optJSONObject("state") ?: return
                state.put("id", senderId)
                val forward = JSONObject().apply {
                    put("type", "PLAYER_STATE")
                    put("state", state)
                }.toString()
                emitWireMessage(forward)
                broadcastToRemotePeers(forward, excludeId = senderId)
            }
            "PLAYER_SHOT" -> {
                val shot = msg.optJSONObject("shot") ?: return
                shot.put("playerId", senderId)
                val forward = JSONObject().apply {
                    put("type", "PLAYER_SHOT")
                    put("shot", shot)
                }.toString()
                emitWireMessage(forward)
                broadcastToRemotePeers(forward, excludeId = senderId)
            }
            "ENEMY_DAMAGE_CLAIM" -> {
                emitWireMessage(rawJson)
            }
            "VEHICLE_ACTION" -> {
                msg.put("playerId", senderId)
                emitWireMessage(msg.toString())
            }
        }
    }

    private fun broadcastLobbyUpdate() {
        val payload = JSONObject().apply {
            put("type", "LOBBY_UPDATE")
            put("roomId", currentRoomId)
            put("roomName", currentRoomName)
            put("roomCode", currentRoomCode)
            put("hostId", "host")
            put("sessionStarted", currentSessionStarted)
            put("players", buildPlayersJsonArray())
        }.toString()
        emitWireMessage(payload)
        broadcastToRemotePeers(payload, excludeId = null)
    }

    private fun buildPlayersJsonArray(): JSONArray {
        val arr = JSONArray()
        peers.values.sortedBy { it.slotIndex }.forEach { p ->
            arr.put(JSONObject().apply {
                put("id", p.id)
                put("name", p.name)
                put("heroId", p.heroId)
                put("accentHex", p.accentHex)
                put("isHost", p.isHost)
                put("ready", p.ready)
                put("slotIndex", p.slotIndex)
            })
        }
        return arr
    }

    private fun startUdpBeaconThread() {
        Thread({
            var sock: DatagramSocket? = null
            try {
                sock = DatagramSocket(null).apply {
                    reuseAddress = true
                    broadcast = true
                    soTimeout = 900
                    bind(InetSocketAddress(UDP_PORT))
                }
                beaconSocket = sock
                val buf = ByteArray(1024)
                var lastBeaconMs = 0L

                while (runningHost.get()) {
                    val now = System.currentTimeMillis()
                    if (now - lastBeaconMs >= 950L) {
                        lastBeaconMs = now
                        val announce = buildBeaconPacketString().toByteArray(Charsets.UTF_8)
                        val targets = collectBroadcastTargets()
                        for (ip in targets) {
                            try {
                                val addr = InetAddress.getByName(ip)
                                sock.send(DatagramPacket(announce, announce.size, addr, UDP_PORT))
                            } catch (_: Exception) {
                            }
                        }
                    }

                    try {
                        val rx = DatagramPacket(buf, buf.size)
                        sock.receive(rx)
                        val txt = String(rx.data, 0, rx.length, Charsets.UTF_8)
                        if (txt.startsWith(DISCOVER_MAGIC)) {
                            val reply = buildBeaconPacketString().toByteArray(Charsets.UTF_8)
                            sock.send(DatagramPacket(reply, reply.size, rx.address, rx.port))
                        }
                    } catch (_: SocketTimeoutException) {
                        // Normal loop cadence
                    }
                }
            } catch (_: Exception) {
                // UDP beacon unavailable on restricted interface; manual IP still works
            } finally {
                try { sock?.close() } catch (_: Exception) {}
                beaconSocket = null
            }
        }, "LanUdpBeacon").apply {
            isDaemon = true
            start()
        }
    }

    private fun buildBeaconPacketString(): String {
        val infoObj = JSONObject(getNetworkInfoJson())
        val hostIp = infoObj.optString("primaryIp", "192.168.43.1")
        val hostName = peers["host"]?.name ?: "Host"
        val json = JSONObject().apply {
            put("roomId", currentRoomId)
            put("roomName", currentRoomName)
            put("roomCode", currentRoomCode)
            put("hostName", hostName)
            put("hostIp", hostIp)
            put("port", TCP_PORT)
            put("playerCount", peers.size)
            put("maxPlayers", MAX_PLAYERS)
            put("sessionStarted", currentSessionStarted)
            put("transport", "NATIVE_TCP")
        }
        return ROOM_MAGIC + json.toString()
    }

    fun startDiscovery() {
        stopDiscovery()
        runningDiscovery.set(true)
        acquireMulticastLock()

        Thread({
            var sock: DatagramSocket? = null
            try {
                sock = try {
                    DatagramSocket(null).apply {
                        reuseAddress = true
                        broadcast = true
                        soTimeout = 750
                        bind(InetSocketAddress(UDP_PORT))
                    }
                } catch (_: Exception) {
                    DatagramSocket().apply {
                        broadcast = true
                        soTimeout = 750
                    }
                }
                discoverySocket = sock
                val buf = ByteArray(2048)
                val probe = DISCOVER_MAGIC.toByteArray(Charsets.UTF_8)
                var lastProbeMs = 0L

                while (runningDiscovery.get()) {
                    val now = System.currentTimeMillis()
                    if (now - lastProbeMs >= 1100L) {
                        lastProbeMs = now
                        val targets = collectBroadcastTargets()
                        for (ip in targets) {
                            try {
                                val addr = InetAddress.getByName(ip)
                                sock.send(DatagramPacket(probe, probe.size, addr, UDP_PORT))
                            } catch (_: Exception) {
                            }
                        }
                    }

                    try {
                        val rx = DatagramPacket(buf, buf.size)
                        sock.receive(rx)
                        val txt = String(rx.data, 0, rx.length, Charsets.UTF_8)
                        if (txt.startsWith(ROOM_MAGIC)) {
                            val roomJson = JSONObject(txt.removePrefix(ROOM_MAGIC))
                            val senderIp = rx.address?.hostAddress
                            if (!senderIp.isNullOrBlank() && senderIp != "0.0.0.0") {
                                roomJson.put("hostIp", senderIp)
                            }
                            roomJson.put("lastSeenMs", System.currentTimeMillis())
                            val evt = JSONObject().apply {
                                put("event", "ROOM_DISCOVERED")
                                put("room", roomJson)
                            }.toString()
                            onEventJson(evt)
                        }
                    } catch (_: SocketTimeoutException) {
                        // Continue scanning
                    }
                }
            } catch (_: Exception) {
                // Ignore UDP discovery failures
            } finally {
                try { sock?.close() } catch (_: Exception) {}
                discoverySocket = null
            }
        }, "LanUdpDiscover").apply {
            isDaemon = true
            start()
        }
    }

    fun stopDiscovery() {
        runningDiscovery.set(false)
        try { discoverySocket?.close() } catch (_: Exception) {}
        discoverySocket = null
        if (!runningHost.get()) {
            releaseMulticastLock()
        }
    }

    fun joinHost(hostIp: String, port: Int, roomCode: String, playerName: String, heroId: String) {
        stopAll()
        ensureExecutor()

        val cleanIp = hostIp.trim().ifEmpty { "192.168.43.1" }
        val cleanPort = if (port in 1024..65535) port else TCP_PORT
        val cleanCode = roomCode.replace(Regex("[^a-zA-Z0-9]"), "").uppercase().take(6)
        val cleanName = sanitizeText(playerName, "Warrior", 18)
        val cleanHero = heroId.ifBlank { "LAKSHMAN" }

        runningClient.set(true)

        Thread({
            try {
                val sock = Socket()
                sock.connect(InetSocketAddress(cleanIp, cleanPort), 5000)
                sock.tcpNoDelay = true
                clientSocket = sock
                val out = DataOutputStream(BufferedOutputStream(sock.getOutputStream()))
                val input = DataInputStream(BufferedInputStream(sock.getInputStream()))
                clientOut = out

                val hello = JSONObject().apply {
                    put("type", "HELLO")
                    put("roomCode", cleanCode)
                    put("playerName", cleanName)
                    put("heroId", cleanHero)
                }.toString()
                synchronized(clientWriteLock) {
                    sendFrameRaw(out, hello)
                }

                while (runningClient.get()) {
                    val frame = readFrame(input) ?: break
                    emitWireMessage(frame)
                }
            } catch (e: Exception) {
                if (runningClient.get()) {
                    emitStatusError("CONNECT_FAILED", e.message ?: "Unable to connect to $cleanIp:$cleanPort")
                }
            } finally {
                if (runningClient.getAndSet(false)) {
                    onEventJson(JSONObject().apply { put("event", "DISCONNECTED") }.toString())
                }
                try { clientSocket?.close() } catch (_: Exception) {}
                clientSocket = null
                clientOut = null
            }
        }, "LanClientSocket").apply {
            isDaemon = true
            start()
        }
    }

    fun sendWireMessage(rawJson: String) {
        if (!runningHost.get() && !runningClient.get()) return
        ensureExecutor()
        sendExecutor.execute {
            if (runningHost.get()) {
                val msg = try {
                    JSONObject(rawJson)
                } catch (_: Exception) {
                    return@execute
                }
                when (msg.optString("type")) {
                    "PING" -> {
                        val pong = JSONObject().apply {
                            put("type", "PONG")
                            put("ts", msg.optLong("ts"))
                            put("serverTimeMs", System.currentTimeMillis())
                        }.toString()
                        emitWireMessage(pong)
                    }
                    "START_MATCH" -> {
                        currentSessionStarted = true
                        broadcastToRemotePeers(rawJson, excludeId = null)
                        emitWireMessage(rawJson)
                        broadcastLobbyUpdate()
                    }
                    "VEHICLE_ACTION_ACK" -> {
                        val targetId = msg.optString("targetPlayerId", "")
                        if (targetId.isNotBlank()) {
                            sendToPeer(targetId, rawJson)
                        }
                    }
                    "LEAVE" -> {
                        stopAll()
                    }
                    else -> {
                        broadcastToRemotePeers(rawJson, excludeId = null)
                    }
                }
            } else if (runningClient.get()) {
                val out = clientOut ?: return@execute
                try {
                    synchronized(clientWriteLock) {
                        sendFrameRaw(out, rawJson)
                    }
                } catch (_: Exception) {
                    stopAll()
                }
            }
        }
    }

    fun stopAll() {
        runningHost.set(false)
        runningClient.set(false)
        stopDiscovery()

        try { serverSocket?.close() } catch (_: Exception) {}
        serverSocket = null

        try { clientSocket?.close() } catch (_: Exception) {}
        clientSocket = null
        clientOut = null

        peers.values.forEach { peer ->
            try { peer.socket?.close() } catch (_: Exception) {}
        }
        peers.clear()

        try { beaconSocket?.close() } catch (_: Exception) {}
        beaconSocket = null
        releaseMulticastLock()
    }

    private fun broadcastToRemotePeers(rawJson: String, excludeId: String?) {
        peers.values.forEach { peer ->
            if (!peer.isHost && peer.id != excludeId && peer.out != null) {
                try {
                    synchronized(peer.writeLock) {
                        sendFrameRaw(peer.out, rawJson)
                    }
                } catch (_: Exception) {
                    try { peer.socket?.close() } catch (_: Exception) {}
                }
            }
        }
    }

    private fun sendToPeer(peerId: String, rawJson: String) {
        val peer = peers[peerId] ?: return
        val out = peer.out ?: return
        try {
            synchronized(peer.writeLock) {
                sendFrameRaw(out, rawJson)
            }
        } catch (_: Exception) {
        }
    }

    private fun emitWireMessage(wireJson: String) {
        val evt = JSONObject().apply {
            put("event", "WIRE")
            put("payload", JSONObject(wireJson))
        }.toString()
        onEventJson(evt)
    }

    private fun emitStatusError(code: String, message: String) {
        val wire = JSONObject().apply {
            put("type", "ERROR")
            put("code", code)
            put("message", message)
        }
        val evt = JSONObject().apply {
            put("event", "WIRE")
            put("payload", wire)
        }.toString()
        onEventJson(evt)
    }

    private fun collectBroadcastTargets(): List<String> {
        val out = linkedSetOf<String>("255.255.255.255", "192.168.43.1", "192.168.43.255", "192.168.49.1")
        try {
            val info = JSONObject(getNetworkInfoJson())
            val bArr = info.optJSONArray("broadcasts")
            if (bArr != null) {
                for (i in 0 until bArr.length()) {
                    out.add(bArr.getString(i))
                }
            }
            val gw = info.optString("suggestedHostIp", "")
            if (gw.isNotBlank()) out.add(gw)
        } catch (_: Exception) {
        }
        return out.toList()
    }

    private fun ensureExecutor() {
        if (sendExecutor.isShutdown) {
            sendExecutor = Executors.newSingleThreadExecutor()
        }
    }

    private fun acquireMulticastLock() {
        try {
            if (multicastLock == null) {
                val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                multicastLock = wm?.createMulticastLock("AstrasLanDiscovery")?.apply {
                    setReferenceCounted(false)
                }
            }
            if (multicastLock?.isHeld == false) {
                multicastLock?.acquire()
            }
        } catch (_: Exception) {
        }
    }

    private fun releaseMulticastLock() {
        try {
            if (multicastLock?.isHeld == true) {
                multicastLock?.release()
            }
        } catch (_: Exception) {
        }
    }

    private fun readFrame(input: DataInputStream): String? {
        val len = input.readInt()
        if (len <= 0 || len > MAX_FRAME_BYTES) return null
        val bytes = ByteArray(len)
        input.readFully(bytes)
        return String(bytes, Charsets.UTF_8)
    }

    private fun sendFrameRaw(out: DataOutputStream, json: String) {
        val bytes = json.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_FRAME_BYTES) return
        out.writeInt(bytes.size)
        out.write(bytes)
        out.flush()
    }

    private fun sanitizeText(raw: String?, fallback: String, maxLen: Int): String {
        val cleaned = (raw ?: "").replace(Regex("[^\\w\\s-]"), "").trim().take(maxLen)
        return cleaned.ifEmpty { fallback }
    }

    private fun accentForHero(heroId: String): String = when (heroId) {
        "LAKSHMAN" -> "#38BDF8"
        "HANUMAN" -> "#FB923C"
        "BHARAT" -> "#34D399"
        "SHATRUGHNA" -> "#A78BFA"
        "ANGAD" -> "#F472B6"
        else -> "#F6C343"
    }

    companion object {
        const val TCP_PORT = 38472
        const val UDP_PORT = 38473
        const val MAX_PLAYERS = 6
        private const val MAX_FRAME_BYTES = 131072
        private const val DISCOVER_MAGIC = "ASTRA_DISCOVER_V1"
        private const val ROOM_MAGIC = "ASTRA_ROOM_V1:"
    }
}
