package com.notdxbi.dxbi.tv

import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Finds Stremio streaming servers (dx.bi or Stremio running on a computer) on the TV's own
 * network, so torrents can play: a TV has no streaming server of its own.
 *
 * Done here rather than in the page: plain-http requests to other machines from an https page
 * run into mixed-content and private-network rules.
 */
object ServerFinder {
    private const val PORT = 11470
    private const val CONNECT_MS = 350
    private const val READ_MS = 1500

    /** Calls [done] (on a background thread) with the servers' addresses, e.g. http://192.168.0.12:11470/ */
    fun find(done: (List<String>) -> Unit) {
        Thread {
            val hosts = LinkedHashSet<String>()
            hosts.add("127.0.0.1") // Stremio's own app on this TV, if it's running
            for (prefix in localPrefixes()) for (i in 1..254) hosts.add("$prefix.$i")
            val pool = Executors.newFixedThreadPool(48)
            val found = java.util.Collections.synchronizedList(ArrayList<String>())
            for (host in hosts) pool.execute { if (isServer(host)) found.add(host) }
            pool.shutdown()
            pool.awaitTermination(20, TimeUnit.SECONDS)
            pool.shutdownNow()
            // This TV first, then in address order
            val sorted = found.sortedWith(compareBy({ it != "127.0.0.1" }, { it.substringAfterLast('.').toIntOrNull() ?: 0 }))
            done(sorted.map { "http://$it:$PORT/" })
        }.start()
    }

    /** The first three parts of each IPv4 address this TV has on a local network (Wi-Fi, Ethernet) */
    private fun localPrefixes(): List<String> = try {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<Inet4Address>()
            .filter { it.isSiteLocalAddress }
            .map { it.hostAddress!!.substringBeforeLast('.') }
            .distinct()
    } catch (_: Exception) {
        emptyList()
    }

    private fun isServer(host: String): Boolean {
        // A quick knock first: most addresses have nothing there
        try {
            Socket().use { it.connect(InetSocketAddress(host, PORT), CONNECT_MS) }
        } catch (_: Exception) {
            return false
        }
        return try {
            val conn = URL("http://$host:$PORT/settings").openConnection() as HttpURLConnection
            conn.connectTimeout = CONNECT_MS * 3
            conn.readTimeout = READ_MS
            try {
                conn.responseCode == 200 && conn.inputStream.bufferedReader().use { it.readText() }.contains("\"values\"")
            } finally {
                conn.disconnect()
            }
        } catch (_: Exception) {
            false
        }
    }
}
