import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
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

// Where the app looks for its updates: the repository it was built from (GitHub Actions says which), so
// a fork's TVs follow the fork's own releases rather than being offered builds signed with another key
val updateRepo = System.getenv("DXBI_UPDATE_REPO") ?: System.getenv("GITHUB_REPOSITORY") ?: "notdxbi/dxbi-stremio"

android {
    namespace = "com.notdxbi.dxbi.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.notdxbi.dxbi.tv"
        minSdk = 24
        targetSdk = 35
        versionName = dxbiVersion
        versionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]
        buildConfigField("String", "UPDATE_REPO", "\"$updateRepo\"")
        // Released builds keep themselves current; test builds run the plugin they were built with
        buildConfigField("boolean", "SELF_UPDATE", "true")
    }

    // Two apps from this code, each released and updated on its own:
    //  - tv: dx.bi TV for Android TV, Google TV and Fire TV (Stremio's page, worked by remote)
    //  - mobile: dx.bi for Android phones and tablets (native screens over Stremio's page)
    flavorDimensions += "device"
    productFlavors {
        create("tv") {
            dimension = "device"
            buildConfigField("boolean", "PHONE_UI", "false")
            buildConfigField("String", "APK_NAME", "\"dxbi-tv.apk\"")
        }
        create("mobile") {
            dimension = "device"
            applicationId = "com.notdxbi.dxbi.mobile"
            buildConfigField("boolean", "PHONE_UI", "true")
            buildConfigField("String", "APK_NAME", "\"dxbi-mobile.apk\"")
            proguardFiles("proguard-mobile.pro")
        }
    }

    buildFeatures {
        buildConfig = true
        // The phone app's screens (TVs keep Stremio's page)
        compose = true
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
        // A release build to test on a phone: as fast as a release (shrunk, optimised, not debuggable),
        // signed with the debug key and installed beside the released app like a debug build
        create("preview") {
            initWith(getByName("release"))
            signingConfig = signingConfigs.getByName("debug")
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-preview"
            matchingFallbacks += "release"
            buildConfigField("boolean", "SELF_UPDATE", "false")
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

androidComponents {
    // The phone app's test builds install next to its released copy (a different key can't replace it),
    // with their own data, and run the plugin they were built with (a released one fetched over it would
    // hide the work being tested). dx.bi TV's test builds stay as they were.
    onVariants(selector().withFlavor("device" to "mobile").withBuildType("debug")) { variant ->
        variant.applicationId.set("com.notdxbi.dxbi.mobile.dev")
        variant.buildConfigFields.put("SELF_UPDATE", com.android.build.api.variant.BuildConfigField("boolean", "false", null))
        variant.outputs.forEach { it.versionName.set("$dxbiVersion-dev") }
    }
    // (the preview build is the phone app's)
    beforeVariants(selector().withFlavor("device" to "tv").withBuildType("preview")) { it.enable = false }
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
    // Sound the device can't decode itself: most phones have no Dolby or DTS decoder, so those films
    // played silently. Jellyfin's build of Media3's FFmpeg extension; the hardware still goes first
    implementation("org.jellyfin.media3:media3-ffmpeg-decoder:1.5.0+1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // Torrents played on the TV itself (no streaming server needed): libtorrent, and a small local
    // web server that hands the downloading file to the player
    implementation("org.libtorrent4j:libtorrent4j:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-arm:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-arm64:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-x86:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-x86_64:2.1.0-39")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    // dx.bi for phones only (the mobile flavor): dx.bi TV has none of these
    // lock screen, headphone and picture-in-picture controls
    "mobileImplementation"("androidx.media3:media3-session:1.5.1")
    // casting to a Chromecast or Google TV (only started when something is cast)
    "mobileImplementation"("com.google.android.gms:play-services-cast-framework:22.0.0")
    "mobileImplementation"("androidx.mediarouter:mediarouter:1.7.0")
    // native screens drawn with Compose, over the page that does Stremio's work
    "mobileImplementation"(platform("androidx.compose:compose-bom:2024.12.01"))
    "mobileImplementation"("androidx.compose.ui:ui")
    "mobileImplementation"("androidx.compose.foundation:foundation")
    "mobileImplementation"("androidx.compose.material3:material3")
    "mobileImplementation"("androidx.compose.material:material-icons-extended")
    "mobileImplementation"("androidx.navigation:navigation-compose:2.8.5")
    // the frosted tab bar: what's behind it, blurred (Android 12 and later; a tint before that)
    "mobileImplementation"("dev.chrisbanes.haze:haze:1.1.1")
    "mobileImplementation"("androidx.activity:activity-compose:1.9.3")
    "mobileImplementation"("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    "mobileImplementation"("io.coil-kt.coil3:coil-compose:3.0.4")
    "mobileImplementation"("io.coil-kt.coil3:coil-network-okhttp:3.0.4")
    "mobileImplementation"("androidx.compose.ui:ui-tooling-preview")
    // (the Compose compiler wants its runtime in every build: dx.bi TV uses none of it, and its release leaves it out)
    "tvImplementation"(platform("androidx.compose:compose-bom:2024.12.01"))
    "tvImplementation"("androidx.compose.runtime:runtime")
}
