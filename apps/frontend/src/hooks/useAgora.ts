import { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useParams } from 'react-router-dom';

// Agora app ID
const APP_ID = "23828ec815ef48438b31cb5bd5c7103f";

export const useAgora = (username: number) => {
    const { roomslug } = useParams();
    const [isJoined, setIsJoined] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [remoteUsers, setRemoteUsers] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);

    const clientRef = useRef<IAgoraRTCClient | null>(null);
    const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
    const initializationAttempted = useRef(false);

    // Initialize Agora client
    const initializeClient = useCallback(async () => {
        // Skip if already initialized or attempted
        if (initializationAttempted.current) {
            console.log("Skipping initialization - already attempted");
            return;
        }

        try {
            console.log("Starting Agora client initialization...");
            initializationAttempted.current = true;
            
            // Create the Agora client
            clientRef.current = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
            console.log("Client created successfully:", clientRef.current);
        } catch (err) {
            console.error("Failed to initialize Agora client:", err);
            setError(err instanceof Error ? err.message : 'Failed to initialize Agora client');
            initializationAttempted.current = false; // Allow retry on failure
        }
    }, []); // No dependencies since we use refs

    // Initialize on mount
    useEffect(() => {
        console.log("Initial mount effect running");
        initializeClient();

        return () => {
            console.log("Cleanup: Component unmounting");
            if (clientRef.current && isJoined) {
                leaveCall();
            }
            // Reset initialization state on unmount
            initializationAttempted.current = false;
            clientRef.current = null;
        };
    }, [initializeClient, isJoined]);

    // Set up event listeners when client is initialized
    useEffect(() => {
        if (!clientRef.current) {
            console.log("Skipping event listener setup - client not ready");
            return;
        }

        console.log("Setting up Agora event listeners");
        const client = clientRef.current;

        const handleUserPublished = async (user: any, mediaType: "audio" | "video" | "datachannel") => {
            await client.subscribe(user, mediaType);
            if (mediaType === "audio") {
                user.audioTrack?.play();
                console.log("Remote audio:", user.uid);
            }
            setRemoteUsers(prev => {
                if (prev.includes(user.uid)) return prev;
                return [...prev, user.uid];
            });
        };

        const handleUserUnpublished = (user: any) => {
            setRemoteUsers(prev => prev.filter(uid => uid !== user.uid));
        };

        const handleUserLeft = (user: any) => {
            setRemoteUsers(prev => prev.filter(uid => uid !== user.uid));
        };

        client.on("user-published", handleUserPublished);
        client.on("user-unpublished", handleUserUnpublished);
        client.on("user-left", handleUserLeft);

        return () => {
            console.log("Cleaning up event listeners");
            client.off("user-published", handleUserPublished);
            client.off("user-unpublished", handleUserUnpublished);
            client.off("user-left", handleUserLeft);
        };
    }, []);

    // Define leaveCall function before it's used in the useEffect
    const leaveCall = useCallback(async () => {
        if (!clientRef.current || !isJoined) {
            console.log("Cannot leave call - not in correct state:", {
                clientExists: !!clientRef.current,
                isJoined
            });
            return;
        }

        try {
            // Stop and close local audio track
            if (localAudioTrackRef.current) {
                localAudioTrackRef.current.stop();
                localAudioTrackRef.current.close();
                localAudioTrackRef.current = null;
            }

            // Leave the channel
            await clientRef.current.leave();

            setIsJoined(false);
            setRemoteUsers([]);
            setError(null);

            console.log("✅ Left voice channel");
        } catch (err) {
            console.error("Error leaving call:", err);
            setError(err instanceof Error ? err.message : 'Failed to leave call');
        }
    }, [isJoined]);

    const joinCall = useCallback(async () => {
        console.log("Join call attempted with state:", {
            clientExists: !!clientRef.current,
            roomslug,
            isJoined
        });

        if (!clientRef.current || !roomslug || isJoined) {
            console.log("Cannot join call - prerequisites not met");
            return;
        }

        try {
            console.log("Attempting to join Agora call in room:", roomslug);

            // Get token from backend
            console.log("Fetching token from backend...");
            const res = await fetch(`https://voxel-backend-12op.onrender.com/get-token?roomName=${encodeURIComponent(roomslug)}&uid=${username}`);

            if (!res.ok) {
                throw new Error('Failed to get token');
            }

            const data = await res.json();
            const token = data.token;
            // Use the numeric UID returned from the server instead of the username
            const numericUid = data.uid;
            
            console.log("Token received successfully");

            // Join the channel
            console.log("Joining Agora channel with:", {
                appId: APP_ID,
                channel: roomslug,
                uid: numericUid // Use the numeric UID from server here
            });
            
            await clientRef.current.join(APP_ID, roomslug, token, numericUid);
            console.log("Successfully joined Agora channel");

            // Create and publish local audio track
            console.log("Creating local audio track...");
            const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            localAudioTrackRef.current = localAudioTrack;
            
            // Initially mute the microphone until the player is on stage
            localAudioTrack.setEnabled(false);
            setIsMicMuted(true);
            
            await clientRef.current.publish([localAudioTrack]);
            console.log("Local audio track published successfully (initially muted)");

            setIsJoined(true);
            setRemoteUsers(prev => {
                if (prev.includes(numericUid)) return prev;
                return [...prev, numericUid];
            });
            setError(null);

            console.log("✅ Joined voice channel:", roomslug);
        } catch (err) {
            // console.error("Error joining call:", err);
            setError(err instanceof Error ? err.message : 'Failed to join call');
            // alert(`Failed to connect to Agora voice channel: ${err}`);
        }
    }, [roomslug, isJoined, username]);

    const toggleMic = useCallback(() => {
        if (!localAudioTrackRef.current) return;

        const newMicState = !isMicMuted;
        localAudioTrackRef.current.setEnabled(!newMicState);
        setIsMicMuted(newMicState);
    }, [isMicMuted]);

    // New method to control microphone based on stage status
    const updateMicrophoneByStageStatus = useCallback((isOnStage: boolean) => {
        if (!localAudioTrackRef.current || !isJoined) return;

        console.log(`Updating microphone state based on stage status: ${isOnStage ? 'ON stage' : 'OFF stage'}`);
        
        // Only enable mic when on stage
        localAudioTrackRef.current.setEnabled(isOnStage);
        setIsMicMuted(!isOnStage);
        
        console.log(`Microphone is now ${isOnStage ? 'UNMUTED' : 'MUTED'}`);
    }, [isJoined]);

    return {
        isJoined,
        isMicMuted,
        remoteUsers,
        error,
        joinCall,
        leaveCall,
        toggleMic,
        updateMicrophoneByStageStatus  // Export the new method
    };
};