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
    final class EffectVoice {
        let node=AVAudioPlayerNode()
        var until:TimeInterval=0
        var token=0
        var kind=""
    }
    let effectEngine=AVAudioEngine()
    var effectVoices:[EffectVoice]=[]
    var effectBuffers:[String:AVAudioPCMBuffer]=[:]
    let priorityEffects:Set<String>=["laser","freeze","melon","explosion","boss","horde","celebrate"]
    let effectKinds:Set<String>=["shot","flesh","metal","shield","iceHit","kill","groan","boss","nibble","laser","freeze","melon","explosion","critical","warning","ui","step","horde","celebrate"]
    var effectGain:Float=0.39
    var effectLastError=""
    var effectStarts=0
    var effectActivity=0
    func playEffect(_ data:[String:Any]) {
        guard let kind=data["kind"] as? String,effectKinds.contains(kind),let variant=data["variant"] as? Int,(0...2).contains(variant) else {return}
        do {
            let key="\(kind)-\(variant)"
            if effectBuffers[key]==nil {
                let file=try AVAudioFile(forReading:Bundle.main.resourceURL!.appendingPathComponent("Web/sfx/\(key).wav"))
                guard let buffer=AVAudioPCMBuffer(pcmFormat:file.processingFormat,frameCapacity:AVAudioFrameCount(file.length)) else {return}
                try file.read(into:buffer);effectBuffers[key]=buffer
            }
            guard let buffer=effectBuffers[key] else {return}
            if effectVoices.isEmpty {
                for _ in 0..<12 {let voice=EffectVoice();effectEngine.attach(voice.node);effectEngine.connect(voice.node,to:effectEngine.mainMixerNode,format:buffer.format);effectVoices.append(voice)}
                effectEngine.mainMixerNode.outputVolume=effectGain;effectEngine.prepare()
            }
            let now=ProcessInfo.processInfo.systemUptime
            guard let voice=effectVoices.first(where:{$0.until<=now}) ?? (priorityEffects.contains(kind) ? effectVoices.first(where:{!priorityEffects.contains($0.kind)}) : nil) else {return}
            effectActivity+=1
            voice.token+=1;let token=voice.token;voice.node.stop();voice.kind=kind
            voice.until=now+Double(buffer.frameLength)/buffer.format.sampleRate
            voice.node.volume=max(0,min(1,(data["volume"] as? NSNumber)?.floatValue ?? 0.2))
            voice.node.pan=max(-0.6,min(0.6,(data["pan"] as? NSNumber)?.floatValue ?? 0))
            if !effectEngine.isRunning {try effectEngine.start()}
            voice.node.scheduleBuffer(buffer,completionCallbackType:.dataPlayedBack) { [weak self,weak voice] _ in
                DispatchQueue.main.async {
                    guard let self=self,let voice=voice,voice.token==token else {return}
                    voice.until=0
                }
            }
            voice.node.play();effectStarts+=1
        }catch{effectLastError=error.localizedDescription;NSLog("Effect playback failed: %@",effectLastError)}
    }
    func stopEffects(){effectActivity+=1;for voice in effectVoices {voice.token+=1;voice.until=0;voice.node.stop()};effectEngine.pause()}
    var tapped = false
    var timeout: DispatchWorkItem?
    var settingsPortrait = true
    var settingsOrientationRevision = 0
    var screenDirection: String { settingsPortrait ? "portrait" : preferredScreenDirection }
    var preferredScreenDirection: String { UserDefaults.standard.string(forKey: "screenDirection") == "portrait" ? "portrait" : "landscape" }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { screenDirection == "landscape" ? .landscapeLeft : .portrait }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { screenDirection == "landscape" ? .landscapeLeft : .portrait }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setNeedsUpdateOfSupportedInterfaceOrientations()
        view.window?.windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: supportedInterfaceOrientations))
    }
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
        NSLayoutConstraint.activate([web.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor), web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)])
        web.load(URLRequest(url: URL(string: "gulu://game/index.html")!))
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(restoreGameAudio), name: UIApplication.didBecomeActiveNotification, object: nil)
        restoreGameAudio()
    }
    @objc func restoreGameAudio() {
        guard activeID == 0 else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
            web?.evaluateJavaScript("document.dispatchEvent(new Event('gulu-audio-ready'))")
        } catch { NSLog("Game audio restoration failed: %@", error.localizedDescription) }
    }
    @objc func background() { stopEffects();cancel(restorePlayback: false); web.evaluateJavaScript("window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('gulu-background'))") }
    var ranPerformanceQA = false
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if !ranPerformanceQA && ProcessInfo.processInfo.arguments.contains("--performance-qa") {
            ranPerformanceQA = true
            UIApplication.shared.isIdleTimerDisabled = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                let script = """
                (async()=>{
                 const report={mode:GuluPerformance.mode,stages:[]},originalRender=render,originalStep=simulateStep,originalPersist=persistRun,originalFrame=frame,originalEnabled=soundscape.enabled,originalRandom=game.random,originalFire=game.fireStrength,originalAuto=game.auto;
                 let stage=null,paint=[],sim=[],gaps=[],last=0,raf=[],lastRAF=0;
                 frame=function(time){if(stage){if(lastRAF)raf.push(time-lastRAF);lastRAF=time;}originalFrame(time);};
                 persistRun=()=>true;
                 render=function(dt){const t=performance.now();if(stage!=='no-drawing')originalRender(dt);if(stage){paint.push(performance.now()-t);if(last)gaps.push(t-last);last=t;}};
                 simulateStep=function(dt){const t=performance.now();originalStep(dt);if(stage)sim.push(performance.now()-t);};
                 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
                 const stats=values=>{values.sort((a,b)=>a-b);return {count:values.length,median:values[Math.floor(values.length*.5)]||0,p95:values[Math.floor(values.length*.95)]||0,max:values.at(-1)||0};};
                 try{
                  for(const variant of ['before','after','muted','no-drawing','sparse-audio','sparse-muted']){const baseline=variant==='before',sparse=variant.startsWith('sparse');soundscape.setEnabled(variant==='before'||variant==='after'||variant==='sparse-audio');
                   window.__renderBaseline=baseline;game.reset();game.status='playing';game.auto=true;game.fireStrength=1;game.quota=10000;game.spawnIn=9999;game.rage=30;game.clones=30;game.stacks.multishot=4;game.stacks.pierce=2;game.random=()=>.4;
                   if(sparse){game.auto=false;game.fireStrength=0;game.rage=0;game.clones=0;}else{for(let i=0;i<80;i++){const z=game.spawn(450+(i%16)*30,130+(i%5)*65,'walker',false);z.hp=z.maxHp=1000000000;z.speed=0;}for(let i=0;i<5;i++)game.effects.push({kind:'melon',x:500+i*80,y:280,life:10,fullLife:10,damage:0,radius:225});}
                   document.querySelector('#startScreen').hidden=true;updateHud(true);await sleep(2000);paint=[];sim=[];gaps=[];last=0;raf=[];lastRAF=0;stage=variant;const sparseTimer=sparse&&variant==='sparse-audio'?setInterval(()=>soundscape.play('shot'),2200):0;await sleep(6000);if(sparseTimer)clearInterval(sparseTimer);
                   report.stages.push({stage,paint:stats(paint),simulation:stats(sim),frameGaps:stats(gaps),rafGaps:stats(raf),bullets:game.bullets.length,enemies:game.enemies.length});stage=null;
                  }
                 }catch(e){report.error=e.message;}
                 finally{game.reset();game.random=originalRandom;game.fireStrength=originalFire;game.auto=originalAuto;game.status='ready';render=originalRender;frame=originalFrame;simulateStep=originalStep;soundscape.setEnabled(originalEnabled);persistRun=originalPersist;window.__renderBaseline=false;soundscape.stop();document.querySelector('#startScreen').hidden=false;updateHud(true);window.__devicePerfReport=JSON.stringify(report);}
                })();void 0;
                """
                self.web.evaluateJavaScript(script)
                DispatchQueue.main.asyncAfter(deadline: .now() + 55) {
                    UIApplication.shared.isIdleTimerDisabled = false
                    self.web.evaluateJavaScript("window.__devicePerfReport || JSON.stringify({error:'measurement incomplete'})") { value, error in
                        let file=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("performance-qa.json")
                        var json=(value as? String).flatMap { $0.data(using:.utf8) }.flatMap { try? JSONSerialization.jsonObject(with:$0) as? [String:Any] } ?? [:]
                        json["lowPowerMode"]=ProcessInfo.processInfo.isLowPowerModeEnabled;json["thermalState"]=ProcessInfo.processInfo.thermalState.rawValue
                        if let bytes=try? JSONSerialization.data(withJSONObject:json){try? bytes.write(to:file)}
                    }
                }
            }
        }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--sound-output-qa") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self.web.evaluateJavaScript("soundscape.play('laser');void 0;")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                    self.web.evaluateJavaScript("JSON.stringify({enabled:soundscape.enabled,volume:soundscape.volume,recording:soundscape.recording,state:soundscape.context?.state,error:soundscape.lastError,gain:soundscape.master?.gain.value,voices:soundscape.voices.size})") { result, error in
                        let session = AVAudioSession.sharedInstance()
                        let report: [String:Any] = ["web":result ?? String(describing:error), "nativeStarts":self.effectStarts,"nativeError":self.effectLastError,"nativeGain":self.effectGain,"systemVolume":session.outputVolume, "category":session.category.rawValue, "outputs":session.currentRoute.outputs.map { ["type":$0.portType.rawValue,"name":$0.portName] }]
                        let path=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("sound-output-qa.json")
                        if let data=try? JSONSerialization.data(withJSONObject:report) { try? data.write(to:path) }
                    }
                }
            }
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--orientation-qa") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                self.web.evaluateJavaScript("window.orientationQA=[];(async()=>{for(const value of ['landscape','portrait','landscape']){const select=document.querySelector('#screenDirection');select.value=value;await select.onchange();await new Promise(r=>setTimeout(r,200));orientationQA.push({requested:value,selected:select.value,width:innerWidth,height:innerHeight,locked:await GuluNative.getScreenDirection()});}})().catch(e=>orientationQA.push({error:e.message}));void 0;")
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    self.web.evaluateJavaScript("JSON.stringify(window.orientationQA)") { result, error in
                        let path = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("orientation-qa.json")
                        try? String(describing: result ?? error as Any).write(to: path, atomically: true, encoding: .utf8)
                    }
                }
            }
            return
        }
        if ProcessInfo.processInfo.arguments.contains("--keyboard-qa") {
            if ProcessInfo.processInfo.arguments.contains("--landscape-qa") {
                UserDefaults.standard.set("landscape", forKey:"screenDirection")
                setNeedsUpdateOfSupportedInterfaceOrientations()
                view.window?.windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeLeft))
            } else {
                UserDefaults.standard.set("portrait", forKey:"screenDirection")
                setNeedsUpdateOfSupportedInterfaceOrientations()
                view.window?.windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                if ProcessInfo.processInfo.arguments.contains("--landscape-qa") {
                    let choice = ProcessInfo.processInfo.arguments.contains("--split-qa") ? "split" : "sidebar"
                    self.web.evaluateJavaScript("const choice=document.querySelector('#landscapeLayout');choice.value='\(choice)';choice.dispatchEvent(new Event('change'));")
                }
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
                          const choice=document.querySelector('#landscapeLayout'),saved=choice.value;
                          choice.value=saved==='split'?'sidebar':'split';choice.dispatchEvent(new Event('change'));choice.value=saved;choice.dispatchEvent(new Event('change'));
                          const letterButtons=[...keyboard.querySelectorAll('button[data-key]')].filter(b=>/^[A-Z]$/.test(b.dataset.key));
                          const switching=skill.typed===6&&letterButtons.length===26&&new Set(letterButtons.map(b=>b.dataset.key)).size===26&&document.querySelector('#sentenceSpace').textContent.includes('空格');
                          const fieldRect=rect(document.querySelector('.battlefield')),frameRect=rect(document.querySelector('.game-frame'));
                          window.overlayQA={fullField:Math.abs(fieldRect.width-frameRect.width)<2&&Math.abs(fieldRect.height-frameRect.height)<2,field:fieldRect,frame:frameRect};
                          return JSON.stringify({overlay:window.overlayQA,mode:game.learningMode,layout:document.body.dataset.landscapeLayout,switching,viewport:{width:innerWidth,height:innerHeight},keyboard:original,board:rect(board),keys,allKeysVisible:keys.length>=30&&keys.every(within),keyboardInsideArsenal:original.bottom<=document.querySelector('.arsenal').getBoundingClientRect().bottom,boardFillsGap:Math.abs(rect(board).bottom-original.top)<=8,scrollWorks,follows,keyboardStationary:original.top===after.top&&window.scrollY===before,errors:window.guluErrors});
                        })()
                        """) { result, error in
                            let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("keyboard-qa.json")
                            try? String(describing: result ?? error as Any).write(to: url, atomically: true, encoding: .utf8)
                            self.web.takeSnapshot(with: nil) { image, _ in
                                try? image?.pngData()?.write(to: url.deletingLastPathComponent().appendingPathComponent("keyboard-qa.png"))
                            }
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
    // Fixed community host; credentials stay in URLSession's persistent cookie store.
    func communityRequest(_ data: [String: Any], id: Int) {
        guard let path = data["path"] as? String,
              let parts = URLComponents(string: path), parts.scheme == nil, parts.host == nil,
              ["account", "account/register", "account/restore", "account/recovery", "account/logout", "leaderboards", "solo/start", "solo/finish", "library/organize", "library/share", "library/share/claim"].contains(parts.path),
              let url = URL(string: "http://101.132.227.80/letter-island/api/" + path) else {
            send(["type":"nativeReply", "id":id, "ok":false, "error":"无效的小院请求"]); return
        }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: parts.path == "library/organize" ? 130 : 10)
        if let body = data["data"] {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            guard let json = try? JSONSerialization.data(withJSONObject: body) else {
                send(["type":"nativeReply", "id":id, "ok":false, "error":"请求格式不正确"]); return
            }
            req.httpBody = json
        }
        URLSession.shared.dataTask(with: req) { [weak self] bytes, response, error in
            DispatchQueue.main.async {
                guard error == nil, let bytes = bytes, let response = response as? HTTPURLResponse,
                      let result = try? JSONSerialization.jsonObject(with: bytes) as? [String:Any] else {
                    self?.send(["type":"nativeReply", "id":id, "ok":false, "error":"无法连接小院，请检查网络后重试"]); return
                }
                self?.send(["type":"nativeReply", "id":id, "ok":true, "result":["status":response.statusCode, "result":result]])
            }
        }.resume()
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
        case "communityRequest": communityRequest(data, id: id)
        case "playEffect": playEffect(data)
        case "setEffectGain":
            if let gain=(data["gain"] as? NSNumber)?.floatValue,gain.isFinite { effectGain=max(0,min(1,gain));effectEngine.mainMixerNode.outputVolume=effectGain;if effectGain==0{stopEffects()} }
        case "stopEffects": stopEffects()
        case "getScreenDirection": send(["type":"nativeReply", "id":id, "ok":true, "result":preferredScreenDirection])
        case "setSettingsPortrait":
            guard let enabled = data["enabled"] as? Bool, let scene = view.window?.windowScene else { send(["type":"nativeReply", "id":id, "ok":false, "error":"无法切换设置方向"]); return }
            let previous = settingsPortrait
            settingsPortrait = enabled; settingsOrientationRevision += 1
            let revision = settingsOrientationRevision
            setNeedsUpdateOfSupportedInterfaceOrientations()
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: supportedInterfaceOrientations)) { [weak self] error in
                guard let self = self, self.settingsOrientationRevision == revision else { return }
                self.settingsPortrait = previous; self.setNeedsUpdateOfSupportedInterfaceOrientations()
                self.send(["type":"nativeReply", "id":id, "ok":false, "error":error.localizedDescription])
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
                guard let self = self else { return }
                self.send(["type":"nativeReply", "id":id, "ok":true, "result":self.screenDirection])
            }
        case "setScreenDirection":
            guard let direction = data["direction"] as? String, ["portrait", "landscape"].contains(direction), let scene = view.window?.windowScene else {
                send(["type":"nativeReply", "id":id, "ok":false, "error":"无法切换屏幕方向"]); return
            }
            if settingsPortrait { UserDefaults.standard.set(direction, forKey:"screenDirection"); send(["type":"nativeReply", "id":id, "ok":true, "result":direction]); return }
            let previous = preferredScreenDirection
            UserDefaults.standard.set(direction, forKey:"screenDirection")
            setNeedsUpdateOfSupportedInterfaceOrientations()
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: supportedInterfaceOrientations)) { [weak self] error in
                UserDefaults.standard.set(previous, forKey:"screenDirection")
                self?.setNeedsUpdateOfSupportedInterfaceOrientations()
                self?.send(["type":"nativeReply", "id":id, "ok":false, "error":error.localizedDescription])
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
                guard let self = self else { return }
                let ok = (direction == "landscape" && scene.interfaceOrientation.isLandscape) || (direction == "portrait" && scene.interfaceOrientation == .portrait)
                if !ok { UserDefaults.standard.set(previous, forKey:"screenDirection"); self.setNeedsUpdateOfSupportedInterfaceOrientations() }
                self.send(["type":"nativeReply", "id":id, "ok":ok, "result":self.screenDirection, "error":"屏幕方向尚未切换，请重试"])
            }
        case "configureQwen": configureQwen(id)
        case "importImage", "organizeLibrary": importLibraryImage(data,id:id)
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
        cancel(restorePlayback: false); player?.stop(); activeID = id
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
    func cancel(restorePlayback: Bool = true) { activeID = 0; audioID = nil; timeout?.cancel(); timeout = nil; stopAudio(); request?.endAudio(); task?.cancel(); task = nil; request = nil; try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation); if restorePlayback && UIApplication.shared.applicationState == .active { restoreGameAudio() } }
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
