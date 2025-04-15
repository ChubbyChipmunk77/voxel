import { useState, useEffect, useRef, useCallback } from "react";
import AgoraRTC, {
  IAgoraRTCClient,
    //@ts-ignore

  IAgoraRTCRemoteUser,
  ILocalAudioTrack,
    //@ts-ignore

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

export interface PlayerJoinedMessage {
  type: 'player_joined';
  username: string;
  roomslug: string;
  position: { x: number, y: number };
}

export interface ExistingPlayersMessage {
  type: 'existing_players';
  roomslug: string;
  players: Array<{
    username: string;
    position: { x: number, y: number };
    onStage?: boolean;
    uid?: UID;
  }>;
}

export type WebSocketMessage =
  | ChatMessage
  | JoinMessage
  | LeaveMessage
  | PlayerMoveMessage
  | PlayerOnStageMessage
  | PlayerJoinedMessage
  | ExistingPlayersMessage;

export interface BroadcastedMSG {
  type: "chat" | "system";
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
  const [players, setPlayers] = useState<Map<string, PlayerData>>(new Map<string, PlayerData>());
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
    //@ts-ignore

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

    const agoraAppId = "23828ec815ef48438b31cb5bd5c7103f";

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
      const agoraAppId = "949d21aaff30482bb5c1116c6020e50a";

      // Generate a random UID for the current user
      const uid = Math.floor(Math.random() * 1000000);
      agoraUidRef.current = uid;
      currentRoomRef.current = roomslug;


      // Join the Agora channel (using roomslug as channel name)
      await agoraClientRef.current.join(agoraAppId, roomslug, null, uid);
      console.log(`Joined Agora channel ${roomslug} with UID ${uid}`);

      // Join the Agora channel with the token and numeric UID from the server
      await agoraClientRef.current.join("23828ec815ef48438b31cb5bd5c7103f", roomslug, data.token, data.uid);


      // Create and publish local audio track
      localAudioTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();
      await agoraClientRef.current.publish([localAudioTrackRef.current]);
      console.log("Local audio track published");

      setIsAudioEnabled(true);

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


    } catch (error) {
      console.error("Error joining Agora channel:", error);

      setIsAudioEnabled(true);

      // Show alert to confirm successful connection to Agora channel
      // alert(`Successfully connected to Agora voice channel: ${roomslug}`);

      return true;
    } catch (error) {
      console.error('Error joining Agora channel:', error);
      // alert(`Failed to connect to Agora voice channel: ${error}`);
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
    console.log("joinRoom called with:", { username, roomslug });
    console.log("WebSocket state:", socketRef.current?.readyState);

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected. State:", socketRef.current?.readyState);
      // Try to reconnect
      connect();
      return;
    }

    userRef.current = username;
    console.log("Setting userRef to:", username);

    const joinMessage: JoinMessage = {
      type: "join",
      username,
      roomslug,
    };

    console.log("Sending join message:", joinMessage);
    socketRef.current.send(JSON.stringify(joinMessage));
  }, []);

  const sendMessage = useCallback((msg: string, roomslug: string, username: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    const sentTime = new Date();
    const userMsg: ChatMessage = {
      type: 'chat',
      username,
      roomslug,
      content: msg,
      sentTime
    };

    // Add message to local state for immediate feedback
    setMessages(prevMessages => [
      ...prevMessages,
      {
        type: "chat",
        sender: username,
        content: msg,
        time: sentTime,
        isOwnMessage: true
      }
    ]);

    console.log("Sending chat message:", userMsg);
    socketRef.current.send(JSON.stringify(userMsg));
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

  // Send player stage status update with audio handling
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

    // Handle Agora audio based on stage status
    if (onStage) {
      // Player is on stage - join Agora channel to start broadcasting audio
      await joinAgoraChannel(roomslug, username);

      // Add to players on stage list
      setPlayersOnStage(prev => {
        if (!prev.includes(username)) {
          return [...prev, username];
        }
        return prev;
      });
    } else {
      // Player left stage - leave Agora channel to stop broadcasting audio
      await leaveAgoraChannel();

      // Remove from players on stage list
      setPlayersOnStage(prev => prev.filter(player => player !== username));
    }
  }, [joinAgoraChannel, leaveAgoraChannel]);

  const leaveRoom = useCallback((username: string, roomslug: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.error("WebSocket is not connected");
      return;
    }

    // If user is on stage, leave Agora channel first
    if (players.get(username)?.onStage) {
      leaveAgoraChannelRef.current();
    }

    const leaveMsg: LeaveMessage = {
      type: 'leave',
      roomslug,
      username
    };

    socketRef.current.send(JSON.stringify(leaveMsg));
    console.log(`User ${username} left room ${roomslug}`);
  }, [players]);


  const connect = useCallback(() => {
    try {
      console.log("Attempting to connect to WebSocket...");
      const ws = new WebSocket("ws://localhost:8080");
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected successfully. State:", ws.readyState);
        setIsConnected(true);

        // If we have a pending join, execute it
        if (userRef.current) {
          console.log("Executing pending join for user:", userRef.current);
          // Re-join any rooms we were in
          // This will be handled by the component's useEffect
        }
      };

  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket("https://faithful-speckled-scorpion.glitch.me/");
        socketRef.current = ws;

        ws.onopen = () => {
          console.log("WebSocket connected");
          setIsConnected(true);
        };


      ws.onmessage = (e) => {
        try {
          const parsedMessage = JSON.parse(e.data);

          // Don't log ping/pong messages to reduce noise
          if (parsedMessage.type !== "ping" && parsedMessage.type !== "pong") {
            console.log("Received WebSocket message:", parsedMessage);
          }

          // Handle heartbeat ping
          if (parsedMessage.type === "ping") {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: "pong" }));
            }
            return;
          }

          // Process message based on type
          switch (parsedMessage.type) {
            case "chat":
              // Extract sender username and handle chat message
              const senderUsername = parsedMessage.username || parsedMessage.sender;
              const isFromCurrentUser = senderUsername === userRef.current;

              if (!isFromCurrentUser) {
                console.log("Received chat message:", parsedMessage);
                setMessages(prevMessages => [
                  ...prevMessages,
                  {
                    type: "chat",
                    sender: senderUsername,
                    content: parsedMessage.content,
                    time: new Date(parsedMessage.time) || new Date(),
                    isOwnMessage: false
                  }
                ]);
              }
              break;

            case "player_joined":
              // Add new player to our map
              const { username: joinUsername } = parsedMessage;
              const initialPosition = parsedMessage.position || { x: 0, y: 0 };
              console.log("Player joined:", joinUsername, "at position:", initialPosition);

              setPlayers(prev => {
                const newMap = new Map(prev);
                newMap.set(joinUsername, {
                  username: joinUsername,
                  position: initialPosition
                });
                console.log("Updated players after join:", Array.from(newMap.entries()));
                return newMap;
              });
              break;

            case "player_move":
              // Update player position in our map
              const { username: moveUsername, position } = parsedMessage;
              console.log("Player move:", moveUsername, "to position:", position);

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
              console.log("Player stage status update:", stageUsername, onStage);

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

            case "existing_players":
              // Initialize map with existing players
              const existingPlayers = parsedMessage.players || [];
              console.log("Received existing players:", existingPlayers);

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
                console.log("Updated players after existing_players:", Array.from(newMap.entries()));
                return newMap;
              });
              break;

            case "player_left":
              const { username: leftUsername } = parsedMessage;
              console.log("Player left:", leftUsername);

              setPlayers(prev => {
                const newMap = new Map(prev);
                newMap.delete(leftUsername);
                console.log("Updated players after leave:", Array.from(newMap.entries()));
                return newMap;
              });

              // Remove from players on stage if they were there
              setPlayersOnStage(prev =>
                prev.filter(player => player !== leftUsername)
              );
              break;
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
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
  }, []);

  useEffect(() => {
    connect();

    return () => {
      console.log("Cleaning up WebSocket connection...");
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]); // Empty dependency array means only run at component mount/unmount

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