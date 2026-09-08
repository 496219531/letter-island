class GuluCaptureProcessor extends AudioWorkletProcessor {
  process(inputs){const channel=inputs[0]?.[0];if(channel){const copy=channel.slice();this.port.postMessage(copy,[copy.buffer]);}return true;}
}
registerProcessor('gulu-capture',GuluCaptureProcessor);
