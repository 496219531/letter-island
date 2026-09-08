import Foundation
import Speech
import AppKit
import AVFoundation

let arguments = CommandLine.arguments
let resultIndex = arguments.firstIndex(of: "--result")
let resultPath: String? = resultIndex.flatMap { $0 + 1 < arguments.count ? arguments[$0 + 1] : nil }
let cancelIndex = arguments.firstIndex(of: "--cancel")
let cancelPath: String? = cancelIndex.flatMap { $0 + 1 < arguments.count ? arguments[$0 + 1] : nil }
func output(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    if let resultPath = resultPath { try? data.write(to: URL(fileURLWithPath: resultPath), options: .atomic) }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
}
func finish(_ value: [String: Any], _ code: Int32 = 0) -> Never { output(value); exit(code) }
let args = CommandLine.arguments
let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
let operation = args.count > 1 ? args[1] : "authorize"
if operation == "probe" {
    finish(["platform": "macOS", "onDevice": recognizer?.supportsOnDeviceRecognition ?? false,
            "authorization": SFSpeechRecognizer.authorizationStatus().rawValue, "bundle":Bundle.main.bundleIdentifier ?? "unknown"])
}
var task: SFSpeechRecognitionTask?
@available(macOS 26.0, *)
func modernRecognition() async {
    do {
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier:"en-US")) else {
            finish(["error":"系统暂不支持英文识别资源。"],2)
        }
        let transcriber = SpeechTranscriber(locale:locale,preset:.transcription)
        if operation == "authorize" {
            if !(await AssetInventory.reservedLocales).contains(locale) { try await AssetInventory.reserve(locale:locale) }
            if let install = try await AssetInventory.assetInstallationRequest(supporting:[transcriber]) {
                try await install.downloadAndInstall()
            }
            finish(["ok":true,"onDevice":true,"engine":"SpeechAnalyzer"])
        }
        guard await AssetInventory.status(forModules:[transcriber]) == .installed else {
            finish(["error":"英文系统识别资源尚未准备好，请点击启用语音权限完成准备。"],2)
        }
        let analyzer = SpeechAnalyzer(modules:[transcriber])
        let results = Task { () throws -> String in
            var parts:[String] = []
            for try await result in transcriber.results {
                if result.isFinal { parts.append(String(result.text.characters)) }
            }
            return parts.joined(separator:" ")
        }
        let audio = try AVAudioFile(forReading:URL(fileURLWithPath:args[2]))
        if let end = try await analyzer.analyzeSequence(from:audio) {
            try await analyzer.finalizeAndFinish(through:end)
        } else { await analyzer.cancelAndFinishNow() }
        let text = try await results.value
        finish(["text":text,"onDevice":true,"engine":"SpeechAnalyzer"])
    } catch {
        finish(["error":"系统英文识别准备或识别失败，请重试。", "details":error.localizedDescription,"code":(error as NSError).code],2)
    }
}
func authorized() {
    if #available(macOS 26.0, *), SpeechTranscriber.isAvailable {
        Task { await modernRecognition() }; return
    }
    guard let recognizer = recognizer, recognizer.supportsOnDeviceRecognition else {
        finish(["error":"此 Mac 尚不能进行本地英文识别，请在系统键盘设置中启用并下载英文听写。"], 2)
    }
    if operation == "authorize" { finish(["ok":true,"onDevice":true]) }
    guard operation == "recognize", args.count >= 3 else { finish(["error":"无效录音请求"], 2) }
    let request = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: args[2]))
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false
    request.taskHint = .dictation
    task = recognizer.recognitionTask(with: request) { result, error in
        if let result = result, result.isFinal {
            finish(["text":result.bestTranscription.formattedString,"onDevice":true])
        }
        if let error = error {
            finish(["error":"系统未能识别这段录音。请确认已安装英文听写资源后重试。", "code":(error as NSError).code,"details":error.localizedDescription], 2)
        }
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
DispatchQueue.main.async {
if SFSpeechRecognizer.authorizationStatus() == .authorized {
    authorized()
} else {
    app.activate(ignoringOtherApps:true)
    SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
            if status == .authorized { authorized() }
            else { finish(["error":"请在系统设置 → 隐私与安全性 → 语音识别中允许花园语音小助手。"], 2) }
        }
    }
}
}
let cancelTimer = Timer.scheduledTimer(withTimeInterval:0.1,repeats:true) { _ in
    if let path = cancelPath, FileManager.default.fileExists(atPath:path) { task?.cancel(); finish(["error":"录音请求已取消"],2) }
}
DispatchQueue.main.asyncAfter(deadline:.now() + (operation == "authorize" ? 900 : 90)) {
    task?.cancel(); finish(["error":"等待系统语音识别超时，请完成系统授权后再试。"], 2)
}
app.run()
