"use client";
import { useState, useEffect, useRef } from 'react';
import * as Phaser from "phaser";
import Sidebar from '../components/Sidebar';
import { useParams } from 'react-router-dom';
import { useRoomSocket } from "../hooks/useWebSocket";
import { useAgora } from "../hooks/useAgora";

function GamePage() {
  const { roomslug } = useParams();
  const [username] = useState(() => Math.floor(Math.random() * 1000000) + 1); // Generate numeric username between 1-1000000

  // Game state refs
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<SceneMain | null>(null);

  // Screen dimensions
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // WebSocket connection
  const {
    isConnected,
    players,
    sendPlayerMove,
    sendPlayerOnStage,
    joinRoom,
    leaveRoom,
    isAudioEnabled,
    playersOnStage
  } = useRoomSocket();

  // Agora voice connection
  const agora = useAgora(username);

  // Get screen size
  useEffect(() => {
    function getScreenSize() {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    }

    getScreenSize();

    window.addEventListener('resize', getScreenSize);
    return () => window.removeEventListener('resize', getScreenSize);
  }, []);

  // Join room when component mounts
  useEffect(() => {
    if (roomslug && username) {
      joinRoom(username.toString(), roomslug);
      // Connect to Agora voice channel when joining room
      agora.joinCall();
    }

    // Cleanup when component unmounts
    return () => {
      if (roomslug && username) {
        leaveRoom(username.toString(), roomslug);
        agora.leaveCall();
      }
    };
  }, []);

  // Handle stage status changes (now only for visual effects)
  const handleStageStatusChange = async (onStage: boolean) => {
    if (!roomslug) return;
    sendPlayerOnStage(onStage, roomslug, username.toString());
  };

  // Update other players when their positions change
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.updateOtherPlayers(players);
    }
  }, [players]);

  // Initialize Phaser game
  useEffect(() => {
    if (dimensions.width === 0) return;

    class SceneMain extends Phaser.Scene {
      private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
      private player!: Phaser.Physics.Arcade.Sprite;
      private map!: Phaser.Tilemaps.Tilemap;
      private layer1!: Phaser.Tilemaps.TilemapLayer;
      private layer2!: Phaser.Tilemaps.TilemapLayer;
      private playerOnStage: boolean = false;
      private otherPlayers: Map<string, Phaser.Physics.Arcade.Sprite> = new Map();
      private lastPositionUpdate = 0;
      private nameLabels: Map<string, Phaser.GameObjects.Text> = new Map();
      private audioIndicators: Map<string, Phaser.GameObjects.Image> = new Map();

      constructor() {
        super("SceneMain");
      }

      preload() {
        this.load.image("tiles", "/assets/tilemap.png");
        this.load.tilemapTiledJSON("map", "/assets/bed.json");

        // Load player sprite
        this.load.image("player", "/assets/player.png");

        // Load audio indicator icon
        this.load.image("audio", "/assets/audio-icon.png"); // Add this icon to your assets
      }

      create() {
        // Store reference to this scene
        sceneRef.current = this;

        // Get canvas width
        const canvasWidth = this.sys.game.canvas.width;

        // Create tilemap
        this.map = this.make.tilemap({
          key: "map"
        });
        const tileset = this.map.addTilesetImage("mapv1", "tiles");

        // Create layers
        this.layer1 = this.map.createLayer("Tile Layer 1", tileset, 0, 0);
        this.layer2 = this.map.createLayer("Tile Layer 2", tileset, 0, 0);

        // Calculate scale factor to make map fit canvas
        const mapWidth = this.map.widthInPixels;
        const scaleX = canvasWidth / mapWidth;

        // Scale map layers
        this.layer1.setScale(scaleX);
        this.layer2.setScale(scaleX);

        // Calculate scaled map height
        const scaledMapHeight = this.map.heightInPixels * scaleX;

        // Resize game to match scaled height
        this.scale.resize(canvasWidth, scaledMapHeight);

        // Set camera bounds
        this.cameras.main.setBounds(0, 0, canvasWidth, scaledMapHeight);

        // Add player sprite
        this.player = this.physics.add.sprite(canvasWidth / 2, scaledMapHeight / 2, 'player');
        this.player.setScale(1.5);
        this.player.setOrigin(0.5, 0.5);
        this.player.setCollideWorldBounds(true);

        // Add username label above player
        const playerLabel = this.add.text(
          this.player.x,
          this.player.y - 30,
          username.toString(),
          { font: '14px Arial', color: '#ffffff', backgroundColor: '#000000' }
        );
        playerLabel.setOrigin(0.5);
        this.nameLabels.set(username.toString(), playerLabel);

        // Set up keyboard input
        this.cursors = this.input.keyboard.createCursorKeys();

        // Set collisions
        this.layer1.setCollisionByProperty({ collides: true });
        this.layer2.setCollisionByProperty({ collides: true });

        // Make player collide with tilemap layers
        this.physics.add.collider(this.player, this.layer1);
        this.physics.add.collider(this.player, this.layer2);

        // Make camera follow player
        this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

        // Center camera initially
        this.cameras.main.centerOn(canvasWidth / 2, scaledMapHeight / 2);

        // Clean up on scene destroy
        this.events.on('destroy', () => {
          sceneRef.current = null;
        });
      }

      update(time: number, delta: number) {
        // Reset velocity
        this.player.setVelocity(0);

        const speed = 160;
        let playerMoved = false;

        // Handle player movement
        if (this.cursors.left.isDown) {
          this.player.setVelocityX(-speed);
          playerMoved = true;
        } else if (this.cursors.right.isDown) {
          this.player.setVelocityX(speed);
          playerMoved = true;
        }

        if (this.cursors.up.isDown) {
          this.player.setVelocityY(-speed);
          playerMoved = true;
        } else if (this.cursors.down.isDown) {
          this.player.setVelocityY(speed);
          playerMoved = true;
        }

        // Normalize diagonal movement
        if (this.player.body.velocity.x !== 0 && this.player.body.velocity.y !== 0) {
          this.player.body.velocity.normalize().scale(speed);
        }

        // Update player label position
        const playerLabel = this.nameLabels.get(username.toString());
        if (playerLabel) {
          playerLabel.setPosition(this.player.x, this.player.y - 30);
        }

        // Update audio indicator for current player if on stage
        if (this.playerOnStage) {
          let audioIcon = this.audioIndicators.get(username.toString());
          if (!audioIcon) {
            audioIcon = this.add.image(this.player.x, this.player.y - 50, 'audio');
            audioIcon.setScale(0.5);
            this.audioIndicators.set(username.toString(), audioIcon);
          }
          audioIcon.setPosition(this.player.x, this.player.y - 50);
        }

        // Check if player is on a stage tile
        const playerTileX = this.layer1.worldToTileX(this.player.x);
        const playerTileY = this.layer1.worldToTileY(this.player.y);

        const tileLayer1 = this.map.getTileAt(playerTileX, playerTileY, false, 'Tile Layer 1');
        const tileLayer2 = this.map.getTileAt(playerTileX, playerTileY, false, 'Tile Layer 2');

        const isOnStage =
          (tileLayer1 && tileLayer1.properties && tileLayer1.properties.stage === true) ||
          (tileLayer2 && tileLayer2.properties && tileLayer2.properties.stage === true);

        // Handle stage entry/exit with audio
        if (isOnStage && !this.playerOnStage) {
          console.log('Player is on stage!');
          this.playerOnStage = true;

          // Send stage status to other players
          if (roomslug && isConnected) {
            sendPlayerOnStage(true, roomslug, username.toString());
          }

          // Visual effect when on stage (optional glow)
          this.player.setTint(0xffff00);

          // Add audio indicator
          if (!this.audioIndicators.get(username.toString())) {
            const audioIcon = this.add.image(this.player.x, this.player.y - 50, 'audio');
            audioIcon.setScale(0.5);
            this.audioIndicators.set(username.toString(), audioIcon);
          }

        } else if (!isOnStage && this.playerOnStage) {
          console.log('Player left the stage!');
          this.playerOnStage = false;

          // Send stage status to other players
          if (roomslug && isConnected) {
            sendPlayerOnStage(false, roomslug, username.toString());
          }

          // Remove visual effect
          this.player.clearTint();

          // Remove audio indicator
          const audioIcon = this.audioIndicators.get(username.toString());
          if (audioIcon) {
            audioIcon.destroy();
            this.audioIndicators.delete(username.toString());
          }
        }

        // Send position updates to other players when this player moves
        if (playerMoved && roomslug && isConnected && time - this.lastPositionUpdate > 100) {
          this.lastPositionUpdate = time;
          sendPlayerMove({ x: this.player.x, y: this.player.y }, roomslug, username.toString());
        }
      }

      // Method to update other players
      updateOtherPlayers(players: Map<string, any>) {
        players.forEach((playerData, playerName) => {
          // Skip current player
          if (playerName === username.toString()) return;

          const position = playerData.position;

          // Get or create sprite for this player
          let playerSprite = this.otherPlayers.get(playerName);
          if (!playerSprite) {
            playerSprite = this.physics.add.sprite(position.x, position.y, 'player');
            playerSprite.setScale(1.5);
            this.otherPlayers.set(playerName, playerSprite);

            // Add collision with map
            this.physics.add.collider(playerSprite, this.layer1);
            this.physics.add.collider(playerSprite, this.layer2);

            // Add username label
            const nameLabel = this.add.text(
              position.x,
              position.y - 30,
              playerName,
              { font: '14px Arial', color: '#ffffff', backgroundColor: '#000000' }
            );
            nameLabel.setOrigin(0.5);
            this.nameLabels.set(playerName, nameLabel);
          }

          // Apply tint if player is on stage
          if (playerData.onStage) {
            playerSprite.setTint(0xffff00);

            // Add audio indicator if not already there
            if (!this.audioIndicators.get(playerName)) {
              const audioIcon = this.add.image(position.x, position.y - 50, 'audio');
              audioIcon.setScale(0.5);
              this.audioIndicators.set(playerName, audioIcon);
            }
          } else {
            playerSprite.clearTint();

            // Remove audio indicator if exists
            const audioIcon = this.audioIndicators.get(playerName);
            if (audioIcon) {
              audioIcon.destroy();
              this.audioIndicators.delete(playerName);
            }
          }

          // Move player with animation
          this.tweens.add({
            targets: playerSprite,
            x: position.x,
            y: position.y,
            duration: 100,
            ease: 'Linear'
          });

          // Update label position
          const label = this.nameLabels.get(playerName);
          if (label) {
            label.setPosition(position.x, position.y - 30);
          }

          // Update audio indicator position
          const audioIndicator = this.audioIndicators.get(playerName);
          if (audioIndicator) {
            audioIndicator.setPosition(position.x, position.y - 50);
          }
        });

        // Clean up disconnected players
        this.otherPlayers.forEach((sprite, playerName) => {
          if (!players.has(playerName)) {
            // Remove sprite
            sprite.destroy();
            this.otherPlayers.delete(playerName);

            // Remove label
            const label = this.nameLabels.get(playerName);
            if (label) {
              label.destroy();
              this.nameLabels.delete(playerName);
            }

            // Remove audio indicator
            const audioIcon = this.audioIndicators.get(playerName);
            if (audioIcon) {
              audioIcon.destroy();
              this.audioIndicators.delete(playerName);
            }
          }
        });
      }
    }

    // Create the Phaser game
    const config = {
      type: Phaser.AUTO,
      width: (dimensions.width / 3) * 2.4,
      height: dimensions.height,
      parent: 'game-container',
      scene: [SceneMain],
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0 },
          debug: false
        }
      }
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
      }
    };
  }, [dimensions, isConnected, roomslug, username, sendPlayerMove, sendPlayerOnStage]);

  // Audio UI indicators - show who's currently on stage
  const renderPlayersOnStage = () => {
    if (playersOnStage.length === 0) return null;

    return (
      <div className="absolute top-4 right-4 bg-black bg-opacity-70 p-2 rounded-lg">
        <h3 className="text-white font-bold mb-1">On Stage:</h3>
        <ul>
          {playersOnStage.map(player => (
            <li key={player} className="text-white flex items-center">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500 mr-2"></span>
              {player}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Audio permission banner if needed
  const [showMicPermission, setShowMicPermission] = useState(false);

  // Check if player is on stage
  const isOnStage = players.get(username.toString())?.onStage || false;

  // Show microphone permission banner when player first goes on stage
  useEffect(() => {
    if (isOnStage && !isAudioEnabled) {
      setShowMicPermission(true);
    } else {
      setShowMicPermission(false);
    }
  }, [isOnStage, isAudioEnabled]);

  return (
    <div className='test flex w-full h-screen relative'>
      <div id="game-container" className="w-4/5 h-full"></div>
      <div className='menu w-1/5 h-full'>
        <Sidebar roomslug={roomslug || ''} />
      </div>

      {/* Audio status indicators */}
      {renderPlayersOnStage()}

      {/* Microphone permission banner */}
      {showMicPermission && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-black p-2 text-center">
          This game requires microphone access for stage audio. Please allow microphone permissions.
        </div>
      )}

      {/* Audio status notification */}
      {isOnStage && (
        <div className="absolute bottom-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full flex items-center">
          <div className="w-2 h-2 bg-red-300 rounded-full animate-pulse mr-2"></div>
          Your microphone is active - you're on stage!
        </div>
      )}

      {/* Mic control overlay buttons */}
      <div className="absolute bottom-4 right-4 flex space-x-2">
        <button
          onClick={() => handleStageStatusChange(true)}
          className={`p-3 rounded-full ${isOnStage ? 'bg-green-500' : 'bg-gray-500'} text-white shadow-lg hover:opacity-90 transition-opacity`}
          title="Go on stage"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        <button
          onClick={() => handleStageStatusChange(false)}
          className={`p-3 rounded-full ${!isOnStage ? 'bg-red-500' : 'bg-gray-500'} text-white shadow-lg hover:opacity-90 transition-opacity`}
          title="Leave stage"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default GamePage;