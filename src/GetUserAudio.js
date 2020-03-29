import React, { useState, useEffect } from 'react'

export default function GetUserAudio() {
  let ampGain
  let ampDist
  let audioContext
  let compressor
  let recordingList
  let recordButton
  let analyser
  let canvas
  let canvasCtx
  let bufferLength
  let dataArray

  const makeDistortionCurve = (amount, sampleRate) => {
    var k = amount,
        n_samples = typeof sampleRate === 'number' ? sampleRate : 44100,
        curve = new Float32Array(n_samples),
        deg = Math.PI / 180,
        i = 0,
        x;
    for ( ; i < n_samples; ++i ) {
      x = i * 2 / n_samples - 1;
      curve[i] = (3 + k)*Math.atan(Math.sinh(x*0.25)*5) / (Math.PI + k * Math.abs(x));
    }

    return curve;
  }

  const updateCanvas = () => {
    let drawVisual = requestAnimationFrame(updateCanvas);
    analyser.getByteTimeDomainData(dataArray);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    canvasCtx.fillStyle = 'rgb(200, 200, 200)';
    canvasCtx.fillRect(0, 0, "100%", "100%");

    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = 'rgb(0, 0, 0)';
    canvasCtx.beginPath();

    var sliceWidth = canvas.width * 1.0 / bufferLength;
    var x = 0;

    for(var i = 0; i < bufferLength; i++) {
      var v = dataArray[i] / 128.0;
      var y = v * canvas.height/2;

      if(i === 0) {
        canvasCtx.moveTo(x, y);
      } else {
        canvasCtx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height/2);
    canvasCtx.stroke();
  }

  const setupContext = () => {
    const context = new AudioContext() || window.webkitAudioContext()
    canvas = document.getElementById('waveform')
    canvasCtx = canvas.getContext('2d')
    audioContext = context

    analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    ampGain = audioContext.createGain()
    ampGain.gain.value = 1
    ampDist = audioContext.createWaveShaper()
    ampDist.curve = makeDistortionCurve(1, audioContext.sampleRate)

    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -12
    compressor.attack.value = 0
    compressor.ratio.value = 20
    compressor.release.value = 0

    let playButton = document.getElementById('play')
    let toggleButton = document.getElementById('toggle')

    playButton.addEventListener('click', playAudio)
    toggleButton.addEventListener('click', togglePlayback)
  }

  const togglePlayback = () => {
    if (audioContext.state === 'running') {
      audioContext.suspend()
    } else if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
  }

  const renderRecording = (blob, list) => {
    const blobUrl = URL.createObjectURL(blob);
    const li = document.createElement('li');
    const audio = document.createElement('audio');
    const anchor = document.createElement('a');
    anchor.setAttribute('href', blobUrl);
    const now = new Date();
    anchor.setAttribute(
      'download',
      `recording-${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDay().toString().padStart(2, '0')}--${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}.webm`
    );
    anchor.innerText = 'Download';
    audio.setAttribute('src', blobUrl);
    audio.setAttribute('controls', 'controls');
    li.appendChild(audio);
    li.appendChild(anchor);
    list.appendChild(li);
  }

  const playAudio = () => {
    // Loads module script via AudioWorklet. 
    if (audioContext) {
      let userStream

      window.navigator.mediaDevices.getUserMedia({ audio: {
        latency: 0.00,
        sampleSize: 256,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }}).then((stream) => {
        const mimeType = 'audio/webm';
        let chunks = []
        const recorder = new MediaRecorder(stream, { type: mimeType })

        recorder.addEventListener('dataavailable', event => {
          if (typeof event.data === 'undefined') return;
          if (event.data.size === 0) return;
          chunks.push(event.data);
        });
        recorder.addEventListener('stop', () => {
          const recording = new Blob(chunks, {
            type: mimeType
          });
          renderRecording(recording, recordingList);
          chunks = [];
        });

        recordButton.removeAttribute('hidden');
        recordButton.addEventListener('click', () => {
          if (recorder.state === 'inactive') {
            recorder.start();
            recordButton.innerText = 'Stop';
          } else {
            recorder.stop();
            recordButton.innerText = 'Record';
           }
         });
        userStream = stream

        audioContext.audioWorklet.addModule('gain-processor.js').then(() => {
          let outputStream = audioContext.createMediaStreamSource(userStream)
          
          let gainWorkletNode = new AudioWorkletNode(audioContext, 'gain-processor')

          outputStream.connect(gainWorkletNode).connect(ampDist).connect(ampGain).connect(compressor).connect(analyser).connect(audioContext.destination)
          updateCanvas()
        })
        .catch((err) => {
          console.log("Error: ", err)
        })
      })

      
    }
  }

  useEffect(() => {
    setupContext()
    document.getElementById('globaldist').addEventListener('change', (e) => {
      ampDist.curve = makeDistortionCurve(e.target.value, audioContext.sampleRate)
    })
    document.getElementById('distgain').addEventListener('change', (e) => {
      ampGain.gain.value = e.target.value
    })
    recordingList = document.getElementById('recordings')
    recordButton = document.getElementById('record')

  }, [])
  
  return (
    <>
    <div className="controls">
      <div className="buttons">
        <button id="play">Get Sound Card Input</button>
        <button id="toggle">Toggle Playback (on by default)</button>
      </div>    

      <div className="sliders">
        <div className="slider">
          <p>Distortion Amount</p>
          <input type="range" min="0" max="50" defaultValue="0" step="0.5" id="globaldist"></input>
        </div>
        <div className="slider">
          <p>Distortion Gain</p>
          <input type="range" min="0" max="1" defaultValue="0" step="0.1" id="distgain"></input>
        </div>
      </div>
      <button id="record">Record</button>
    </div>
    <div>
      <ul id="recordings">

      </ul>
      <canvas id="waveform"/>
    </div>
    </>
  )
}