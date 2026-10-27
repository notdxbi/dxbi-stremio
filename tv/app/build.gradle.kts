import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The TV app shares dx.bi's version number: it's read from the plugin at the repository root
val pluginFile = rootProject.file("../dxbi.plugin.js")
val dxbiVersion = Regex("""@version\s+([\d.]+)""").find(pluginFile.readText())!!.groupValues[1]
val versionParts = dxbiVersion.split(".").map { it.toInt() }

// Release signing: tv/keystore.properties (not in git) or the DXBI_TV_KEYSTORE* environment variables in CI
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(key: String, env: String): String? = keystoreProps.getProperty(key) ?: System.getenv(env)

android {
    namespace = "com.notdxbi.dxbi.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.notdxbi.dxbi.tv"
        minSdk = 24
        targetSdk = 35
        versionName = dxbiVersion
        versionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]
    }

    signingConfigs {
        create("release") {
            val store = signingValue("storeFile", "DXBI_TV_KEYSTORE")
            if (store != null) {
                storeFile = rootProject.file(store)
                storePassword = signingValue("storePassword", "DXBI_TV_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "DXBI_TV_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "DXBI_TV_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            // the emulator is x86
            ndk { abiFilters += listOf("armeabi-v7a", "arm64-v8a", "x86", "x86_64") }
        }
        release {
            // TVs and sticks are ARM: only those copies of the torrent engine (about 14 MB each)
            ndk { abiFilters += listOf("armeabi-v7a", "arm64-v8a") }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (signingValue("storeFile", "DXBI_TV_KEYSTORE") != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    // The torrent engine's native code compressed in the APK: a smaller download for updates
    packaging {
        jniLibs { useLegacyPackaging = true }
    }

    // The built-in dx.bi plugin is the one at the repository root, copied in at build time
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/dxbiAssets"))
}

val copyPlugin by tasks.registering(Copy::class) {
    from(pluginFile)
    into(layout.buildDirectory.dir("generated/dxbiAssets"))
}
tasks.named("preBuild") { dependsOn(copyPlugin) }

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.media3:media3-exoplayer:1.5.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.5.1")
    implementation("androidx.media3:media3-exoplayer-dash:1.5.1")
    implementation("androidx.media3:media3-ui:1.5.1")
    implementation("androidx.media3:media3-datasource-okhttp:1.5.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Torrents played on the TV itself (no streaming server needed): libtorrent, and a small local
    // web server that hands the downloading file to the player
    implementation("org.libtorrent4j:libtorrent4j:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-arm:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-arm64:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-x86:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-x86_64:2.1.0-39")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
}
