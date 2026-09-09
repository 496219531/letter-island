import UIKit
import WebKit
import Speech
import AVFoundation
import SafariServices

@main class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        guard url.scheme == "gulugarden", url.host == "home" else { return false }
        window?.rootViewController?.dismiss(animated: true)
        return true
    }
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = GameController()
        window?.makeKeyAndVisible()
        return true
    }
}
final class AssetHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        let root = Bundle.main.resourceURL!.appendingPathComponent("Web").standardizedFileURL
        let path = task.request.url!.path
        let file = root.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else { task.didFailWithError(NSError(domain: "GuluAssets", code: 404)); return }
        let mime = ["html":"text/html", "js":"application/javascript", "css":"text/css", "png":"image/png", "svg":"image/svg+xml", "json":"application/json"][file.pathExtension] ?? "application/octet-stream"
        task.didReceive(URLResponse(url: task.request.url!, mimeType: mime, expectedContentLength: data.count, textEncodingName: ["html","js","css","json"].contains(file.pathExtension) ? "utf-8" : nil))
        task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
final class GameController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    var web: WKWebView!
    let engine = AVAudioEngine()
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    var request: SFSpeechAudioBufferRecognitionRequest?
    var task: SFSpeechRecognitionTask?
    var activeID = 0
    var audioFile: AVAudioFile?
    var audioID: String?
    var player: AVAudioPlayer?
    var tapped = false
    var timeout: DispatchWorkItem?
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
    override func viewDidLoad() {
        super.viewDidLoad()
        if !UserDefaults.standard.bool(forKey:"qwen37ModelDefault") {
            UserDefaults.standard.set("qwen3.7-flash",forKey:"qwenVisionModel")
            UserDefaults.standard.set(true,forKey:"qwen37ModelDefault")
        }
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("SpeechAttempts")
        try? FileManager.default.removeItem(at: cache)
        try? FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--layout-qa=audio-check") {
            let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1)!
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1600)!
            buffer.frameLength = 1600
            for i in 0..<1600 { buffer.floatChannelData![0][i] = Float(sin(Double(i) * 440 * 2 * .pi / 16000)) * 0.01 }
            let file = try? AVAudioFile(forWriting: cache.appendingPathComponent("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA.wav"), settings: [AVFormatIDKey:kAudioFormatLinearPCM, AVSampleRateKey:16000, AVNumberOfChannelsKey:1, AVLinearPCMBitDepthKey:16, AVLinearPCMIsFloatKey:false])
            try? file?.write(from: buffer)
        }
        #endif
        view.backgroundColor = UIColor(red: 0.05, green: 0.13, blue: 0.09, alpha: 1)
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(AssetHandler(), forURLScheme: "gulu")
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(self, name: "gulu")
        let bridge = try! String(contentsOf: Bundle.main.url(forResource: "bridge", withExtension: "js")!, encoding: .utf8)
        config.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor), web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)])
        web.load(URLRequest(url: URL(string: "gulu://game/index.html")!))
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.willResignActiveNotification, object: nil)
    }
    @objc func background() { cancel(); web.evaluateJavaScript("window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('gulu-background'))") }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--keyboard-qa") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self.web.evaluateJavaScript("document.querySelector('#difficulty').value='sentences';begin(true);updateTypingControls();game.update=()=>{};updateHud(true);") { _, error in
                    guard error == nil else { return }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                        self.web.evaluateJavaScript("""
                        (()=>{
                          const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
                          const keyboard=document.querySelector('#touchKeyboard'),board=document.querySelector('.skill-card.iphone-visible');
                          const keys=[...keyboard.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>({key:e.dataset.key,...rect(e)}));
                          const within=r=>r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;
                          const original=rect(keyboard),before=window.scrollY;
                          const probe=document.createElement('div');probe.style.cssText='height:1200px;flex:none';board.append(probe);
                          board.scrollTop=board.scrollHeight;
                          const after=rect(keyboard);
                          const scrollWorks=board.scrollTop>0;probe.remove();board.scrollTop=0;
                          const skill=game.skills[0];game.select(0);const first=spellKeysMarkup(skill,true);for(const char of skill.code.slice(0,6))game.input(char);updateHud(true);
                          const follows=skill.typed===6&&spellKeysMarkup(skill,true)!==first&&!!document.querySelector('#skillKeys0 .next');
                          return JSON.stringify({mode:game.learningMode,viewport:{width:innerWidth,height:innerHeight},keyboard:original,board:rect(board),keys,allKeysVisible:keys.length>=30&&keys.every(within),keyboardInsideArsenal:original.bottom<=document.querySelector('.arsenal').getBoundingClientRect().bottom,boardFillsGap:Math.abs(rect(board).bottom-original.top)<=8,scrollWorks,follows,keyboardStationary:original.top===after.top&&window.scrollY===before,errors:window.guluErrors});
                        })()
                        """) { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("keyboard-qa.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                }
            }
            return
        }
        if let flag = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--layout-qa=") }) {
            let mode = String(flag.dropFirst("--layout-qa=".count))
            guard ["english", "sentences", "speaking", "ready", "settings", "settings-check", "battle", "home-check", "colors-check", "settings-focus", "speech-target-check", "ending-check", "review-check", "diff-preview", "audio-check", "library-editor", "library-check"].contains(mode) else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                let setup = ["library-editor","library-check"].contains(mode) ? "GuluLibraryUI.open();[...document.querySelectorAll('.library-dialog button')].find(b=>b.textContent.includes('新建分组')).click();" : mode == "audio-check" ? "window.audioQA={ok:false};GuluNative.retainAudio(['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']).then(()=>GuluNative.playAudio('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA')).then(()=>{audioQA.ok=true;GuluNative.stopAudio();GuluNative.deleteAudio(['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']);}).catch(e=>audioQA.error=e.message);" : ["review-check","diff-preview"].contains(mode) ? "document.querySelector('#difficulty').value='speaking';begin(true);updateTypingControls();rememberSpeechAttempt({index:0,code:game.skills[0].code},'I like apples','');updateHud(true);" : mode == "ending-check" ? "begin(true);" : mode == "speech-target-check" ? "document.querySelector('#difficulty').value='speaking';begin(true);updateTypingControls();speechAuthorized=true;nativeSpeechReady=true;updateHud(true);" : mode == "settings-focus" ? "document.querySelector('#difficulty').focus();document.querySelector('#settingsPanel').open=true;" : mode == "colors-check" ? "begin(true);" : mode == "home-check" ? "begin(true);game.score=123;" : mode == "battle" ? "begin(true);game.setFireStrength(0);" : mode == "settings-check" ? "begin(true);document.querySelector('#settingsPanel').open=true;" : mode == "settings" ? "document.querySelector('#settingsPanel').open=true;" : mode == "ready" ? "" : "document.querySelector('#difficulty').value='\(mode)';begin(true);updateTypingControls();game.pause();updateHud(true);"
                self.web.evaluateJavaScript(setup)
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                    if mode == "library-check" {
                        self.web.evaluateJavaScript("(() => {const d=[...document.querySelectorAll('.library-dialog')].at(-1),body=d.querySelector('.library-body');body.querySelector('input[type=text]').value='QA苹果组';const raw=body.querySelector('textarea');raw.value='apple\\nbanana\\ncat';[...body.querySelectorAll('button')].find(b=>b.textContent.includes('预览并')).click();const first=body.querySelector('.library-entry');const result={preview:body.querySelectorAll('.library-entry').length===3,ipa:!!first.querySelectorAll('input')[2].value};const zh=first.querySelectorAll('input')[1];zh.value='人工苹果';zh.dispatchEvent(new Event('input'));[...body.querySelectorAll('button')].find(b=>b.textContent==='确认保存分组').click();const repo=GuluCustomLibrary.repository(localStorage);const group=repo.list().find(g=>g.name==='QA苹果组');result.saved=group.entries[0].meaning==='人工苹果';document.querySelector('.library-dialog header button').click();document.querySelector('#difficulty').value='english';GuluLibraryUI.refresh();document.querySelector('#customGroup').value=group.id;begin(true);result.play=game.customBank.id===group.id&&game.skills.every(s=>group.entries.some(e=>e.word===s.code));result.snapshot=GuluSave.validate(GuluSave.encode(game));return JSON.stringify(result);})()") { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("library-check.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                    if mode == "audio-check" {
                        self.web.evaluateJavaScript("JSON.stringify(window.audioQA)") { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("audio-check.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                    if mode == "review-check" {
                        self.web.evaluateJavaScript("window.reviewBefore={code:game.skills[0].code,casts:game.casts,count:reviewStore.list().length};skipSpeechPrompt();")
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                            self.web.evaluateJavaScript("(() => {const records=reviewStore.list();const result={changed:game.skills[0].code!==reviewBefore.code,noCast:game.casts===reviewBefore.casts,saved:records.length===reviewBefore.count+1,attempt:records[0].attempts[0].text==='I like apples'};openSpeechReview();result.open=!!document.querySelector('.speech-review-dialog[open]');return JSON.stringify(result);})()") { result, error in
                                let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("review-check.json")
                                try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                            }
                        }
                    }
                    if mode == "ending-check" {
                        self.web.evaluateJavaScript("(() => {const result={};for(const mode of ['letters','english','sentences','speaking']){game.learningMode=mode;finishScreen(false);const copy=GuluModeCopy.practiceCopy(mode,{correct:game.correct,casts:game.casts});result[mode]=document.querySelector('#dialogContent').textContent.includes(copy.summary)&&document.querySelector('#againButton').textContent===copy.again;}return JSON.stringify(result);})()") { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("ending-check.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                    if mode == "speech-target-check" {
                        self.web.evaluateJavaScript("(() => {const result={automatic:game.typing===0,ready:!document.querySelector('#speechButton').disabled};document.querySelector('.iphone-skill-tabs button:nth-child(2)').click();result.manual=game.typing===1&&document.querySelector('.skill-card.iphone-visible').dataset.skill==='1';const count=game.casts;game.speak(game.typing,game.skills[game.typing].code);updateHud(true);result.cast=game.casts===count+1;result.stays=game.typing===1&&document.querySelector('.skill-card.iphone-visible').dataset.skill==='1';result.cooldown=document.querySelector('#speechButton').disabled;game.skills[1].cd=0;updateHud(true);result.readyAgain=!document.querySelector('#speechButton').disabled;return JSON.stringify(result);})()") { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("speech-target-check.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                    if mode == "settings-focus" {
                        self.web.evaluateJavaScript("(() => {const d=document.querySelector('#mobileSettingsDialog');const opened=d.open;d.querySelector('button').click();return JSON.stringify({opened,closed:!d.open,focus:document.activeElement.tagName,home:!document.querySelector('#startScreen').hidden,modePicker:!!document.querySelector('#modePicker')});})()") { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("settings-focus.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                    if mode == "colors-check" {
                        self.web.evaluateJavaScript("(() => {const keys=[...document.querySelectorAll('#touchKeyboard .hint')];const result={three:keys.length===3,owners:new Set(keys.map(k=>k.dataset.hintSkill)).size===3,colors:new Set(keys.map(k=>getComputedStyle(k).backgroundColor)).size===3};const key=keys.find(k=>k.dataset.hintSkill==='1');key.click();result.direct=game.typing===1&&game.skills[1].typed===1;result.follows=[...document.querySelectorAll('#touchKeyboard .hint')].every(k=>k.dataset.hintSkill==='1');game.pause();return JSON.stringify(result);})()") { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("colors-check.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                    if mode == "home-check" {
                        self.web.evaluateJavaScript("(() => {document.querySelector('#homeButton').click();const result={home:game.status==='ready',visible:!document.querySelector('#startScreen').hidden,saved:JSON.parse(localStorage.getItem('gulu-run-v1')).run.state.score===123,modeVisible:document.querySelector('#difficulty').getBoundingClientRect().height>0};continueRun();result.restored=game.score===123&&game.status==='playing';pauseScreen();document.querySelector('#pauseHomeButton').click();result.pauseExit=game.status==='ready';document.querySelector('#difficulty').value='sentences';begin(true);result.reselected=game.learningMode==='sentences'&&game.status==='playing';returnHome();return JSON.stringify(result);})()") { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("home-check.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                    if mode == "settings-check" {
                        self.web.evaluateJavaScript("(() => {const d=document.querySelector('#mobileSettingsDialog'),c=d.querySelector('.difficulty-controls'),r=d.getBoundingClientRect();const result={open:d.open,paused:game.status==='paused',fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,controlsFit:c.scrollWidth<=c.clientWidth+1};const input=document.querySelector('#fireStrength');input.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));input.value='50';input.dispatchEvent(new Event('input',{bubbles:true}));result.staysOpen=d.open;result.slider=game.fireStrength;d.querySelector('button').click();result.closed=!d.open;result.resumed=game.status==='playing';return JSON.stringify(result);})()") { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("settings-check.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                        }
                    }
                    self.web.evaluateJavaScript("JSON.stringify({errors:window.guluErrors,height:innerHeight,width:innerWidth,scroll:document.body.scrollHeight,rects:[...document.querySelectorAll('.topbar,.game-frame,.battlefield,.arsenal,#skillGrid,#touchKeyboard,#speechControl,.iphone-skill-tabs')].filter(e=>e.getClientRects().length).map(e=>({name:e.id||e.className,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,height:e.getBoundingClientRect().height})),mode:game.learningMode})") { result, error in
                        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("diagnostics.txt")
                        try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                    }
                }
            }
        }
        #endif
    }
    func send(_ value: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: value), let text = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.GuluNativeReceive(\(text))")
    }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == "gulu", message.frameInfo.request.url?.host == "game",
              let data = message.body as? [String: Any], let command = data["command"] as? String else { return }
        let id = data["id"] as? Int ?? 0
        switch command {
        case "configureQwen": configureQwen(id)
        case "importImage": importLibraryImage(data,id:id)
        case "translateTexts": translateLibrary(data,id:id)
        case "exportLibrary": exportLibrary(data,id:id)
        case "authorize":
            AVAudioSession.sharedInstance().requestRecordPermission { mic in
                SFSpeechRecognizer.requestAuthorization { status in
                    DispatchQueue.main.async { self.send(["type":"permission", "id":id, "ok":mic && status == .authorized]) }
                }
            }
        case "retainAudio", "deleteAudio", "playAudio", "stopAudio":
            let fm = FileManager.default
            let cache = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("SpeechAttempts")
            let saved = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("SpeechReview")
            let ids = (data["ids"] as? [String] ?? []).filter { UUID(uuidString: $0) != nil }
            do {
                try fm.createDirectory(at: saved, withIntermediateDirectories: true)
                if command == "retainAudio" { for key in ids { let dest = saved.appendingPathComponent(key + ".wav"); if !fm.fileExists(atPath: dest.path) { try fm.copyItem(at: cache.appendingPathComponent(key + ".wav"), to: dest) } } }
                if command == "deleteAudio" { player?.stop(); for key in ids { try? fm.removeItem(at: saved.appendingPathComponent(key + ".wav")) } }
                if command == "playAudio", let key = ids.first { player?.stop(); try AVAudioSession.sharedInstance().setCategory(.playback); try AVAudioSession.sharedInstance().setActive(true); player = try AVAudioPlayer(contentsOf: saved.appendingPathComponent(key + ".wav")); if player?.play() != true { throw NSError(domain: "GuluAudio", code: 1, userInfo: [NSLocalizedDescriptionKey:"录音暂时无法播放"]) } }
                if command == "stopAudio" { player?.stop() }
                send(["type":"nativeReply", "id":id, "ok":true])
            } catch { send(["type":"nativeReply", "id":id, "ok":false, "error":error.localizedDescription]) }
        case "start": start(id)
        case "stop": if id == activeID { stopAudio(); request?.endAudio(); let work = DispatchWorkItem { [weak self] in self?.fail(id, "识别超时，请重试") }; timeout = work; DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: work) }
        case "cancel": if id == activeID { cancel() }
        default: break
        }
    }
    func start(_ id: Int) {
        cancel(); player?.stop(); activeID = id
        guard SFSpeechRecognizer.authorizationStatus() == .authorized, AVAudioSession.sharedInstance().recordPermission == .granted else { fail(id, "请先允许麦克风和语音识别权限"); return }
        guard let recognizer = recognizer, recognizer.isAvailable else { fail(id, "系统英语语音识别当前不可用"); return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker])
            try session.setActive(true)
            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = false
            req.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
            request = req
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0 else { fail(id, "麦克风尚未准备好"); return }
            let key = UUID().uuidString
            let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("SpeechAttempts/" + key + ".wav")
            let recording = try AVAudioFile(forWriting: url, settings: [AVFormatIDKey:kAudioFormatLinearPCM, AVSampleRateKey:format.sampleRate, AVNumberOfChannelsKey:format.channelCount, AVLinearPCMBitDepthKey:16, AVLinearPCMIsFloatKey:false, AVLinearPCMIsBigEndianKey:false])
            audioID = key; audioFile = recording
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in req.append(buffer); try? recording.write(from: buffer) }
            tapped = true
            task = recognizer.recognitionTask(with: req) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self = self, self.activeID == id else { return }
                    if let result = result, result.isFinal { self.stopAudio(); self.send(["type":"result", "id":id, "text":result.bestTranscription.formattedString, "audioId":self.audioID ?? ""]); self.cancel() }
                    else if let error = error { self.fail(id, error.localizedDescription) }
                }
            }
            engine.prepare(); try engine.start()
            send(["type":"start", "id":id, "audioId":key])
        } catch { fail(id, error.localizedDescription) }
    }
    func stopAudio() { engine.stop(); if tapped { engine.inputNode.removeTap(onBus: 0); tapped = false }; audioFile = nil }
    func cancel() { activeID = 0; audioID = nil; timeout?.cancel(); timeout = nil; stopAudio(); request?.endAudio(); task?.cancel(); task = nil; request = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    func fail(_ id: Int, _ text: String) { stopAudio(); send(["type":"error", "id":id, "error":text, "audioId":audioID ?? ""]); cancel() }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "gulu" && url.lastPathComponent == "duel.html" {
            decisionHandler(.cancel)
            let alert = UIAlertController(title: "连接局域网对战", message: "电脑启动对战服务后，填写显示的局域网地址。手机需连接同一 Wi-Fi；结束对战后点“完成”即可回到本地单机。", preferredStyle: .alert)
            alert.addTextField { field in field.placeholder = "http://192.168.1.10:4174"; field.keyboardType = .URL; field.autocapitalizationType = .none; field.text = UserDefaults.standard.string(forKey: "duelAddress") }
            alert.addAction(UIAlertAction(title: "取消", style: .cancel))
            alert.addAction(UIAlertAction(title: "连接", style: .default) { _ in
                let text = alert.textFields?.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard var parts = URLComponents(string: text), ["http", "https"].contains(parts.scheme ?? ""), parts.host != nil else { return }
                parts.path = "/duel.html"; parts.fragment = nil
                var items = parts.queryItems ?? []
                items.removeAll { $0.name == "source" }
                items.append(URLQueryItem(name: "source", value: "ios"))
                parts.queryItems = items
                if let target = parts.url { UserDefaults.standard.set(text, forKey: "duelAddress"); self.present(SFSafariViewController(url: target), animated: true) }
            })
            present(alert, animated: true)
        } else if url.scheme == "gulu" && url.host == "game" { decisionHandler(.allow) } else { decisionHandler(.cancel); if ["http","https"].contains(url.scheme ?? "") { UIApplication.shared.open(url) } }
    }
}
