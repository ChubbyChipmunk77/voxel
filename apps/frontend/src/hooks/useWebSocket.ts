import { useState, useEffect, useRef, useCallback } from "react";
import AgoraRTC, {
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ILocalAudioTrack,
  ILocalVideoTrack,
  UID
} from "agora-rtc-sdk-ng";

// Message types for type safety
export interface ChatMessage {
  type: 'chat';
  username: string;
  roomslug: string;
  content: string;
  sentTime?: Date;
}

export interface JoinMessage {
  type: 'join';
  username: string;
  roomslug: string;
}

export interface LeaveMessage {
  type: 'leave';
  roomslug: string;
  username: string;
}

export interface PlayerMoveMessage {
  type: 'player_move';
  username: string;
  roomslug: string;
  position: { x: number, y: number };
}

export interface PlayerOnStageMessage {
  type: 'player_on_stage';
  username: string;
  roomslug: string;
  onStage: boolean;
}

export interface BroadcastedMSG {
  type: "chat";
  sender: string;
  content: string;
  time: Date;
  isOwnMessage?: boolean;
}

export interface PlayerData {
  username: string;
  position: { x: number, y: number };
  onStage?: boolean;
  uid?: UID; // Agora user ID for audio
}

interface UseRoomSocketReturn {
  isConnected: boolean;
  messages: BroadcastedMSG[];
  players: Map<string, PlayerData>;
  joinRoom: (username: string, roomslug: string) => void;
  sendMessage: (msg: string, roomslug: string, username: string) => void;
  sendPlayerMove: (position: { x: number, y: number }, roomslug: string, username: string) => void;
  sendPlayerOnStage: (onStage: boolean, roomslug: string, username: string) => void;
  leaveRoom: (username: string, roomslug: string) => void;
  // Agora audio methods
  isAudioEnabled: boolean;
  playersOnStage: string[];
}

export const useRoomSocket = (): UseRoomSocketReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<BroadcastedMSG[]>([]);
  const [players, setPlayers] = useState<Map<string, PlayerData>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [playersOnStage, setPlayersOnStage] = useState<string[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const userRef = useRef<string | null>(null);

  // Agora client reference
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<ILocalAudioTrack | null>(null);
  const agoraUidRef = useRef<UID | null>(null);
  const currentRoomRef = useRef<string | null>(null);

  // Stable function refs
  const leaveAgoraChannelRef = useRef(async () => {
    if (!agoraClientRef.current) return;

    try {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }

      await agoraClientRef.current.leave();
      console.log("Left Agora channel");
      currentRoomRef.current = null;
      agoraUidRef.current = null;
      setIsAudioEnabled(false);
    } catch (error) {
      console.error("Error leaving Agora channel:", error);
    }
  });

  // Initialize Agora client ONCE
  useEffect(() => {
    // Check if client already exists to prevent duplication
    if (agoraClientRef.current) return;

    const agoraAppId = import.meta.env.VITE_AGORA_APP_ID as string;

    if (agoraAppId) {
      agoraClientRef.current = AgoraRTC.createClient({
        mode: "rtc",
        codec: "vp8"
      });

      // Set up event listeners only once
      agoraClientRef.current.on("user-published", async (user, mediaType) => {
        if (mediaType === "audio") {
          await agoraClientRef.current?.subscribe(user, mediaType);
          user.audioTrack?.play();
          console.log(`Remote user ${user.uid} audio subscribed`);
        }
      });

      agoraClientRef.current.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "audio") {
          console.log(`Remote user ${user.uid} audio unsubscribed`);
        }
      });
    }

    // Clean up only when component unmounts (not on re-renders)
    return () => {
      if (agoraClientRef.current && agoraUidRef.current) {
        // Only leave if we're actually connected
        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.stop();
          localAudioTrackRef.current.close();
        }
        agoraClientRef.current.leave().catch(console.error);
        setIsAudioEnabled(false);
      }
    };
  }, []); // Empty dependency array - run only once on mount

  // Join Agora channel when player goes on stage
  const joinAgoraChannel = useCallback(async (roomslug: string, username: string) => {
    if (!agoraClientRef.current) return;

    try {
      // Use the actual username as the UID parameter
      const uid = username;

      // Fetch token from backend
      const response = await fetch(`http://localhost:5000/get-token?roomName=${roomslug}&uid=${uid}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get token');
      }

      // Join the Agora channel with the token and numeric UID from the server
      await agoraClientRef.current.join(import.meta.env.VITE_AGORA_APP_ID, roomslug, data.token, data.uid);

      // Create and publish local audio track
      localAudioTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();
      await agoraClientRef.current.publish([localAudioTrackRef.current]);

      // Update player data with Agora UID
      setPlayers(prev => {
        const newMap = new Map(prev);
        const currentData = newMap.get(username) || {
          username,
          position: { x: 0, y: 0 }
        };
        newMap.set(username, { ...currentData, uid });
        return newMap;
      });

      setIsAudioEnabled(true);

      // Show alert to confirm successful connection to Agora channel
      alert(`Successfully connected to Agora voice channel: ${roomslug}`);

      return true;
    } catch (error) {
      console.error('Error joining Agora channel:', error);
      alert(`Failed to connect to Agora voice channel: ${error}`);
      return false;
    }
  }, []);

  // Leave Agora channel when player leaves stage
  const leaveAgoraChannel = useCallback(async () => {
    if (!agoraClientRef.current) return;

    try {
      // Stop and close local tracks
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }

      // Leave the channel
      await agoraClientRef.current.leave();
      console.log("Left Agora channel");
      currentRoomRef.current = null;
      agoraUidRef.current = null;
      setIsAudioEnabled(false);

    } catch (error) {
      console.error("Error leaving Agora channel:", error);
    }
  }, []);

  const joinRoom = useCallback((username: string, roomslug: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    userRef.current = username;

    const joinMessage: JoinMessage = {
      type: "join",
      username,
      roomslug,
    };

    socketRef.current.send(JSON.stringify(joinMessage));
    console.log(`User ${username} joined room ${roomslug}`);

    // Connect to Agora voice channel when joining the room
    joinAgoraChannel(roomslug, username);
  }, [joinAgoraChannel]);

  const sendMessage = useCallback((msg: string, roomslug: string, username: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    const userMsg: ChatMessage = {
      type: 'chat',
      username,
      roomslug,
      content: msg,
      sentTime: new Date()
    };

    // Add message to local state for immediate feedback
    setMessages(prevMessages => [
      ...prevMessages,
      {
        type: "chat",
        sender: username,
        content: msg,
        time: new Date(),
        isOwnMessage: true
      }
    ]);

    socketRef.current.send(JSON.stringify(userMsg));
    console.log(`Message sent by ${username} in room ${roomslug}: "${msg}"`);
  }, []);

  // Send player position update
  const sendPlayerMove = useCallback((position: { x: number, y: number }, roomslug: string, username: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    const moveMsg: PlayerMoveMessage = {
      type: 'player_move',
      username,
      roomslug,
      position
    };

    socketRef.current.send(JSON.stringify(moveMsg));

    // Update local player data too
    setPlayers(prev => {
      const newMap = new Map(prev);
      const currentData = newMap.get(username) || { username, position: { x: 0, y: 0 } };
      newMap.set(username, { ...currentData, position });
      return newMap;
    });
  }, []);

  // Send player stage status update without audio handling
  const sendPlayerOnStage = useCallback(async (onStage: boolean, roomslug: string, username: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    const stageMsg: PlayerOnStageMessage = {
      type: 'player_on_stage',
      username,
      roomslug,
      onStage
    };

    socketRef.current.send(JSON.stringify(stageMsg));

    // Update local player data
    setPlayers(prev => {
      const newMap = new Map(prev);
      const currentData = newMap.get(username) || {
        username,
        position: { x: 0, y: 0 }
      };
      newMap.set(username, { ...currentData, onStage });
      return newMap;
    });

    // Update players on stage list
    if (onStage) {
      setPlayersOnStage(prev => {
        if (!prev.includes(username)) {
          return [...prev, username];
        }
        return prev;
      });
    } else {
      setPlayersOnStage(prev => prev.filter(player => player !== username));
    }
  }, []);

  const leaveRoom = useCallback((username: string, roomslug: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    // Leave Agora channel when leaving the room
    leaveAgoraChannel();

    const leaveMsg: LeaveMessage = {
      type: 'leave',
      roomslug,
      username
    };

    socketRef.current.send(JSON.stringify(leaveMsg));
    console.log(`User ${username} left room ${roomslug}`);
  }, [leaveAgoraChannel]);

  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket("ws://localhost:8080");
        socketRef.current = ws;

        ws.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
        };

        ws.onmessage = (e) => {
          try {
            console.log("Raw received data:", e.data);
            const parsedMessage = JSON.parse(e.data);
            console.log("Received message:", parsedMessage);

            // Process message based on type
            switch (parsedMessage.type) {
              case "chat":
                // Extract sender username and handle chat message
                const senderUsername = parsedMessage.username || parsedMessage.sender;
                const isFromCurrentUser = senderUsername === userRef.current;

                if (!isFromCurrentUser) {
                  setMessages(prevMessages => [
                    ...prevMessages,
                    {
                      type: "chat",
                      sender: senderUsername,
                      content: parsedMessage.content,
                      time: parsedMessage.sentTime || parsedMessage.time || new Date(),
                      isOwnMessage: false
                    }
                  ]);
                }
                break;

              case "player_move":
                // Update player position in our map
                const { username: moveUsername, position } = parsedMessage;

                setPlayers(prev => {
                  const newMap = new Map(prev);
                  const currentData = newMap.get(moveUsername) || {
                    username: moveUsername,
                    position: { x: 0, y: 0 }
                  };
                  newMap.set(moveUsername, { ...currentData, position });
                  return newMap;
                });
                break;

              case "player_on_stage":
                // Update player stage status
                const { username: stageUsername, onStage } = parsedMessage;

                setPlayers(prev => {
                  const newMap = new Map(prev);
                  const currentData = newMap.get(stageUsername) || {
                    username: stageUsername,
                    position: { x: 0, y: 0 }
                  };
                  newMap.set(stageUsername, { ...currentData, onStage });
                  return newMap;
                });

                // Update players on stage list
                if (onStage) {
                  setPlayersOnStage(prev => {
                    if (!prev.includes(stageUsername)) {
                      return [...prev, stageUsername];
                    }
                    return prev;
                  });
                } else {
                  setPlayersOnStage(prev =>
                    prev.filter(player => player !== stageUsername)
                  );
                }
                break;

              case "player_joined":
                // Add new player to our map
                const { username: joinUsername } = parsedMessage;
                const initialPosition = parsedMessage.position || { x: 0, y: 0 };

                setPlayers(prev => {
                  const newMap = new Map(prev);
                  newMap.set(joinUsername, {
                    username: joinUsername,
                    position: initialPosition
                  });
                  return newMap;
                });
                break;

              case "player_left":
                // Remove player from our map
                const { username: leftUsername } = parsedMessage;

                setPlayers(prev => {
                  const newMap = new Map(prev);
                  newMap.delete(leftUsername);
                  return newMap;
                });

                // Remove from players on stage if they were there
                setPlayersOnStage(prev =>
                  prev.filter(player => player !== leftUsername)
                );
                break;

              case "existing_players":
                // Initialize map with existing players
                const existingPlayers = parsedMessage.players || [];

                setPlayers(prev => {
                  const newMap = new Map(prev);
                  existingPlayers.forEach((player: PlayerData) => {
                    newMap.set(player.username, player);

                    // Add to players on stage list if they're on stage
                    if (player.onStage) {
                      setPlayersOnStage(prevPlayers => {
                        if (!prevPlayers.includes(player.username)) {
                          return [...prevPlayers, player.username];
                        }
                        return prevPlayers;
                      });
                    }
                  });
                  return newMap;
                });
                break;
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        ws.onclose = () => {
          console.log("WebSocket disconnected");
          setIsConnected(false);
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          setIsConnected(false);
        };
      } catch (error) {
        console.error("Failed to connect:", error);
      }
    };

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []); // Empty dependency array means only run at component mount/unmount

  return {
    isConnected,
    messages,
    players,
    joinRoom,
    sendMessage,
    sendPlayerMove,
    sendPlayerOnStage,
    leaveRoom,
    isAudioEnabled,
    playersOnStage
  };
};