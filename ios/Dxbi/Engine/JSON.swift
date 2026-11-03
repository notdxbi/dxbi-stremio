import Foundation

// The page speaks JSON: what dxbi-engine.js sends is read with these, the way the Android app's
// Models.kt reads it (a missing or null field is just empty)

typealias JSON = [String: Any]

extension Dictionary where Key == String, Value == Any {
    /** A string that's really there: nil for missing, null and "" */
    func text(_ key: String) -> String? {
        guard let v = self[key], !(v is NSNull) else { return nil }
        let s = (v as? String) ?? "\(v)"
        return s.isEmpty ? nil : s
    }
    func string(_ key: String) -> String { text(key) ?? "" }
    func int(_ key: String, _ fallback: Int = 0) -> Int { (self[key] as? NSNumber)?.intValue ?? fallback }
    func double(_ key: String, _ fallback: Double = 0) -> Double { (self[key] as? NSNumber)?.doubleValue ?? fallback }
    func bool(_ key: String) -> Bool { (self[key] as? NSNumber)?.boolValue ?? false }
    func object(_ key: String) -> JSON? { self[key] as? JSON }
    func objects(_ key: String) -> [JSON] { (self[key] as? [Any])?.compactMap { $0 as? JSON } ?? [] }
    func strings(_ key: String) -> [String] { (self[key] as? [Any])?.compactMap { $0 as? String } ?? [] }
    func isNull(_ key: String) -> Bool { self[key] == nil || self[key] is NSNull }
}

enum Json {
    static func encode(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject([value]),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]) else { return "null" }
        return String(decoding: data, as: UTF8.self)
    }

    static func decode(_ text: String) -> Any? {
        try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed])
    }

    /** A string as a JavaScript string literal */
    static func quote(_ text: String) -> String {
        (try? String(decoding: JSONEncoder().encode(text), as: UTF8.self)) ?? "\"\""
    }
}
