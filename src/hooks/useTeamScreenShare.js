import { useCallback, useEffect, useRef, useState } from "react";
import { sendTeamCallSignal, subscribeTeamCallSignals } from "../lib/teamCall";

const RTC_CONFIGURATION = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function useTeamScreenShare({ roomId, user }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const peerRef = useRef(null);
  const roleRef = useRef(null);
  const candidateQueueRef = useRef([]);
  const pendingCandidatesRef = useRef([]);
  const stopSharingRef = useRef(null);
  const seenSignalIdsRef = useRef(new Set());
  const initialSignalsLoadedRef = useRef(false);

  const closePeer = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    candidateQueueRef.current = [];
    setRemoteStream(null);
  }, []);

  const createPeer = useCallback(
    (role) => {
      closePeer();
      const peer = new RTCPeerConnection(RTC_CONFIGURATION);
      roleRef.current = role;
      peer.ontrack = (event) => setRemoteStream(event.streams[0] || null);
      peer.onicecandidate = (event) => {
        if (event.candidate) {
          void sendTeamCallSignal({
            roomId,
            user,
            type: "candidate",
            payload: event.candidate.toJSON(),
          });
        }
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
          setStatus("idle");
          closePeer();
        }
      };
      peerRef.current = peer;
      return peer;
    },
    [closePeer, roomId, user],
  );

  const flushCandidates = useCallback(async (peer) => {
    for (const candidate of candidateQueueRef.current.splice(0)) {
      await peer.addIceCandidate(candidate);
    }
  }, []);

  useEffect(() => {
    if (!user?.email) return undefined;

    return subscribeTeamCallSignals({
      roomId,
      onChange: (signals) => {
        if (!initialSignalsLoadedRef.current) {
          signals.forEach((signal) => seenSignalIdsRef.current.add(signal.id));
          initialSignalsLoadedRef.current = true;
          return;
        }

        signals.forEach((signal) => {
          if (seenSignalIdsRef.current.has(signal.id) || signal.senderEmail === user.email) return;
          seenSignalIdsRef.current.add(signal.id);
          const processSignal = async () => {
            if (signal.type === "stop") {
              setStatus("idle");
              closePeer();
              return;
            }

            if (signal.type === "offer") {
              const peer = createPeer("guest");
              await peer.setRemoteDescription(signal.payload);
              candidateQueueRef.current.push(...pendingCandidatesRef.current.splice(0));
              await flushCandidates(peer);
              const answer = await peer.createAnswer();
              await peer.setLocalDescription(answer);
              await sendTeamCallSignal({ roomId, user, type: "answer", payload: answer });
              setStatus("watching");
              return;
            }

            if (signal.type === "answer" && peerRef.current && roleRef.current === "host") {
              await peerRef.current.setRemoteDescription(signal.payload);
              await flushCandidates(peerRef.current);
              setStatus("sharing");
              return;
            }

            if (signal.type === "candidate") {
              if (!peerRef.current) {
                pendingCandidatesRef.current.push(signal.payload);
              } else if (peerRef.current.remoteDescription) {
                await peerRef.current.addIceCandidate(signal.payload);
              } else {
                candidateQueueRef.current.push(signal.payload);
              }
            }
          };
          void processSignal().catch((signalError) => {
            console.error("Failed to process team call signal", signalError);
            setError("화면공유 연결에 실패했습니다. 다시 시도해주세요.");
            setStatus("idle");
          });
        });
      },
      onError: () => setError("화면공유 연결을 준비하지 못했습니다."),
    });
  }, [closePeer, createPeer, flushCandidates, roomId, user]);

  const startSharing = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const peer = createPeer("host");
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        void stopSharingRef.current?.();
      });
      setLocalStream(stream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendTeamCallSignal({ roomId, user, type: "offer", payload: offer });
      setStatus("connecting");
    } catch (shareError) {
      if (shareError?.name !== "NotAllowedError") setError("화면공유를 시작하지 못했습니다.");
    }
  }, [createPeer, roomId, user]);

  const stopSharing = useCallback(async () => {
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setStatus("idle");
    closePeer();
    try {
      await sendTeamCallSignal({ roomId, user, type: "stop" });
    } catch (stopError) {
      console.error("Failed to stop team screen share", stopError);
    }
  }, [closePeer, localStream, roomId, user]);

  useEffect(() => {
    stopSharingRef.current = stopSharing;
  }, [stopSharing]);

  useEffect(() => () => {
    localStream?.getTracks().forEach((track) => track.stop());
    closePeer();
  }, [closePeer, localStream]);

  return { localStream, remoteStream, status, error, startSharing, stopSharing };
}
