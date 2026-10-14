import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import { api } from './client';
export default function SmilePecVideoCall({ meeting, action, close }: { meeting: any; action: (s: string) => string; close: () => void }) {
 const own = useRef<HTMLVideoElement>(null), remote = useRef<HTMLVideoElement>(null), connection = useRef<RTCPeerConnection | null>(null), stream = useRef<MediaStream | null>(null);
 const [status, setStatus] = useState('Vérification de la caméra et du micro…'), [error, setError] = useState(''), [muted, setMuted] = useState(false), [camera, setCamera] = useState(true), [connected, setConnected] = useState(false), [attempt,setAttempt]=useState(0);
 useEffect(() => {
  let stopped = false, timer: ReturnType<typeof setTimeout>, last = 0, polling = false, generation = '';
  const pendingIce: RTCIceCandidateInit[] = [];
  const send = (kind: string, payload: unknown) => api(action('collaboration-signal'), { id: meeting.id, kind, payload, generation });
  const run = async () => {
   try {
    const started = await api(action('collaboration-call-start'),{id:meeting.id});generation=started.generation;
    const info = await api(action('collaboration-call') + '&id=' + meeting.id + '&generation=' + generation);
    const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: true });
    if (stopped) { media.getTracks().forEach(t => t.stop()); return; }
    stream.current = media; if (own.current) own.current.srcObject = media;
    const peer = new RTCPeerConnection({ iceServers: info.iceServers }); connection.current = peer;
    media.getTracks().forEach(track => peer.addTrack(track, media));
    peer.ontrack = event => { if (remote.current) remote.current.srcObject = event.streams[0]; };
    peer.onicecandidate = event => { if (event.candidate) void send('ice', event.candidate.toJSON()).catch(e => setError(e.message)); };
    peer.onconnectionstatechange = () => {
     setConnected(peer.connectionState === 'connected');
     setStatus(({ connected: 'Visio en cours', connecting: 'Connexion à votre interlocuteur…', failed: 'La connexion a échoué. Réessayez ou utilisez le lien de visio de SmilePec.', disconnected: 'Connexion interrompue…', closed: 'Visio terminée', new: 'En attente de votre interlocuteur…' } as any)[peer.connectionState]);
    };
    setStatus('En attente de votre interlocuteur…');
    if (info.initiator) { const offer = await peer.createOffer(); await peer.setLocalDescription(offer); await send('offer', offer); }
    const poll = async () => {
     if (stopped || polling) return; polling = true;
     try {
      const result = await api(action('collaboration-call') + '&id=' + meeting.id + '&after=' + last + '&generation=' + generation);
      if(result.restart){setAttempt(n=>n+1);return;}
      for (const signal of result.signals) {
       last = Math.max(last, Number(signal.id));
       if (signal.kind === 'hangup') { setStatus('Votre interlocuteur a quitté la visio.'); peer.close(); break; }
       if (signal.kind === 'offer') { await peer.setRemoteDescription(signal.payload); const answer = await peer.createAnswer(); await peer.setLocalDescription(answer); await send('answer', answer); }
       else if (signal.kind === 'answer' && peer.signalingState === 'have-local-offer') await peer.setRemoteDescription(signal.payload);
       else if (signal.kind === 'ice') pendingIce.push(signal.payload);
       if (peer.remoteDescription) while (pendingIce.length) await peer.addIceCandidate(pendingIce.shift()!);
      }
     } catch (e) { if (!stopped) setError((e as Error).message); }
     finally { polling = false; if (!stopped && peer.connectionState !== 'closed') timer = setTimeout(poll, 2000); }
    };
    void poll();
   } catch (e) { setError((e as Error).name === 'NotAllowedError' ? 'Autorisez le micro et la caméra pour rejoindre la visio.' : (e as Error).message); }
  };
  setError('');setConnected(false);setMuted(false);setCamera(true);void run();
  return () => { stopped = true; clearTimeout(timer); connection.current?.close(); stream.current?.getTracks().forEach(t => t.stop()); void send('hangup', {}).catch(() => {}); };
 }, [meeting.id,attempt]);
 return <div className="modal-backdrop"><section className="sp-call" role="dialog" aria-modal="true" aria-label="Visio SmilePec"><header><strong>SmilePec · rendez-vous en visio</strong><span role="status">{status}</span></header>{error && <p role="alert">{error} <button onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></p>}<div className="sp-call-videos"><video ref={remote} autoPlay playsInline controls={false} aria-label="Votre interlocuteur" />{!connected && <span className="sp-call-wait">Votre interlocuteur apparaîtra ici.</span>}<video ref={own} autoPlay muted playsInline className="sp-call-own" aria-label="Votre caméra" /></div><footer><button aria-label={muted ? 'Activer le micro' : 'Couper le micro'} aria-pressed={muted} onClick={() => { stream.current?.getAudioTracks().forEach(t => t.enabled = muted); setMuted(!muted); }}>{muted ? <MicOff /> : <Mic />}</button><button aria-label={camera ? 'Couper la caméra' : 'Activer la caméra'} aria-pressed={!camera} onClick={() => { stream.current?.getVideoTracks().forEach(t => t.enabled = !camera); setCamera(!camera); }}>{camera ? <Video /> : <VideoOff />}</button><button className="sp-call-end" onClick={close}><PhoneOff />Quitter</button></footer></section></div>;
}
