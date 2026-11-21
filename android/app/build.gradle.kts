import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

val envKeystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")
val configuredStoreFile: File? = when {
    !envKeystorePath.isNullOrBlank() -> file(envKeystorePath)
    keystorePropertiesFile.exists() && !keystoreProperties.getProperty("storeFile").isNullOrBlank() ->
        rootProject.file(keystoreProperties.getProperty("storeFile"))
    else -> null
}
val hasReleaseKeystore = configuredStoreFile != null && configuredStoreFile.exists()

android {
    namespace = "com.bharata.astras"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.bharata.astras"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = configuredStoreFile
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                    ?: keystoreProperties.getProperty("storePassword")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                    ?: keystoreProperties.getProperty("keyAlias")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
                    ?: keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Uses release keystore when keystore.properties or ANDROID_KEYSTORE_* env vars are present;
            // falls back to debug keystore so local/CI `./gradlew assembleRelease` always produces an installable APK.
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    androidResources {
        noCompress += listOf("js", "mjs", "css", "html", "json", "jpg", "png", "webp", "woff2")
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

// Automatically syncs fresh Vite production build (../dist) into app assets when present
// and prunes stale hashed JS/CSS chunks, while building cleanly standalone if only android/ is imported.
val distSourceDir = rootProject.file("../dist")
val appAssetsDir = layout.projectDirectory.dir("src/main/assets").asFile

val syncDistAssets by tasks.registering {
    onlyIf { distSourceDir.exists() && File(distSourceDir, "index.html").exists() }
    doLast {
        val staleAssetsDir = File(appAssetsDir, "assets")
        if (staleAssetsDir.exists()) {
            staleAssetsDir.deleteRecursively()
        }
        appAssetsDir.mkdirs()
        distSourceDir.copyRecursively(appAssetsDir, overwrite = true)
    }
}

tasks.named("preBuild") {
    dependsOn(syncDistAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
