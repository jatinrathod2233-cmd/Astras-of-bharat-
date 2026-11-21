import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

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
            // Uses debug keystore by default if no release keystore is configured,
            // allowing immediate local APK generation in Android Studio.
            // Replace with your release signingConfig before Play Store upload.
            signingConfig = signingConfigs.getByName("debug")
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

// Automatically syncs fresh Vite production build (../dist) into app assets when present,
// while still compiling cleanly standalone using the already-bundled assets folder.
val syncDistAssets by tasks.registering(Copy::class) {
    val distDir = file("${rootProject.projectDir.parentFile}/dist")
    val targetAssetsDir = file("src/main/assets")
    onlyIf { distDir.exists() && File(distDir, "index.html").exists() }
    from(distDir)
    into(targetAssetsDir)
}

tasks.named("preBuild") {
    dependsOn(syncDistAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.constraintlayout:constraintlayout:2.2.0")
}
