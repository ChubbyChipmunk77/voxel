"use client";
import { useEffect, useRef, useState } from 'react';
import { useRoomSocket } from "../hooks/useWebSocket";

export default function Sidebar({ roomslug }: {
    roomslug: string
}) {
    console.log(roomslug)
    const [activeTab, setActiveTab] = useState('messages');
    const messageRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { isConnected, messages, joinRoom, sendMessage, leaveRoom } = useRoomSocket();
    const [username] = useState((Math.random()).toString()); // Store username in state

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Join room when component mounts and websocket is connected
    useEffect(() => {
        if (isConnected) {
            joinRoom(username, roomslug);
            console.log(`Joining room ${roomslug} as ${username}`);
        }
    }, [isConnected, joinRoom, roomslug, username]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (isConnected) {
                leaveRoom(username, roomslug);
                console.log(`Leaving room ${roomslug}`);
            }
        };
    }, [isConnected, leaveRoom, roomslug, username]);
//@ts-ignore
    const [members, setMembers] = useState([
        { id: 1, name: 'Alex', online: true, avatar: '👩' },
        { id: 2, name: 'Sam', online: true, avatar: '👨' },
        { id: 3, name: 'Taylor', online: true, avatar: '👧' },
        { id: 4, name: 'Jordan', online: false, avatar: '👦' },
        { id: 5, name: 'Casey', online: true, avatar: '🧑' },
        { id: 6, name: 'Robin', online: false, avatar: '👱' }
    ]);
    
    // YouTube video state
    //@ts-ignore
    const [videoId, setVideoId] = useState('dQw4w9WgXcQ'); // Default video ID
    
    const handleSendMessage = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (messageRef.current && messageRef.current.value.trim()) {
            // Send the message through WebSocket
            sendMessage(messageRef.current.value, roomslug, username);
            
            // Clear input field after sending
            messageRef.current.value = '';
        }
    };
    if (!isConnected){
        return (
            <div>
                Loading
            </div>
        )
    }

    return (
        <div className="w-full bg-[#392e2b] h-full flex flex-col border-l-4 border-[#5d4037] shadow-lg text-[#e8d4b7] font-pixel"> 
            {/* Connection status indicator */}
            <div className={`px-2 py-1 text-xs ${isConnected ? 'bg-green-800' : 'bg-red-800'}`}>
                {isConnected ? 'Connected to chat' : 'Disconnected - trying to reconnect...'}
            </div>
            
            {/* Top section (3/5 height) */}
            <div className="h-3/5 flex flex-col">
                {/* Tabs */}
                <div className="pixel-tabs flex border-b-4 border-[#5d4037]">
                    <button 
                        className={`flex-1 py-2 px-4 text-center ${activeTab === 'messages' ? 'bg-[#cb803e] text-white' : 'bg-[#392e2b] hover:bg-[#4d3c38]'}`}
                        onClick={() => setActiveTab('messages')}
                    >
                        <div className="pixel-icon mb-1">💬</div>
                        Messages
                    </button>
                    <button 
                        className={`flex-1 py-2 px-4 text-center ${activeTab === 'members' ? 'bg-[#cb803e] text-white' : 'bg-[#392e2b] hover:bg-[#4d3c38]'}`}
                        onClick={() => setActiveTab('members')}
                    >
                        <div className="pixel-icon mb-1">👥</div>
                        Members
                    </button>
                </div>
                
                {/* Content area */}
                <div className="flex-grow overflow-auto p-4 bg-[#2e2421]">
                    {activeTab === 'messages' && (
                        <div className="messages-container overflow-y-auto max-h-full">
                            {messages.map((message, index) => (
                                <div key={index} className="message mb-4 border-2 border-[#5d4037] bg-[#3e322f] p-1 rounded-lg">
                                    <div className="message-header flex justify-between">
                                        <span className="font-bold text-[#ffc107]">{message.sender}</span>
                                        <span className="text-xs text-[#a1887f]">
                                            {new Date(message.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </span>
                                    </div>
                                    <div className="message-body mt-1 text-[#e8d4b7]">
                                        {message.content}
                                    </div>
                                </div>
                            ))}
                            {/* Add an empty div at the end that we'll scroll to */}
                            <div ref={messagesEndRef} />
                            
                            {messages.length === 0 && (
                                <div className="text-center text-gray-500 mt-4">
                                    No messages yet. Be the first to say hello!
                                </div>
                            )}
                        </div>
                    )}
                    
                    {activeTab === 'members' && (
                        <div className="grid grid-cols-2 gap-3">
                            {members.map(member => (
                                <div key={member.id} className={`member-card p-3 border-2 ${member.online ? 'border-[#4caf50]' : 'border-[#5d4037]'} bg-[#3e322f] rounded-lg flex items-center`}>
                                    <div className="pixel-avatar mr-2 w-8 h-8 flex items-center justify-center bg-[#cb803e] rounded-md">
                                        {member.avatar}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold">{member.name}</span>
                                        <span className={`text-xs ${member.online ? 'text-[#4caf50]' : 'text-[#a1887f]'}`}>
                                            {member.online ? 'Online' : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Chat input */}
                {activeTab === 'messages' && (
                    <form 
                        className="chat-input-container p-3 bg-[#3e322f] border-t-4 border-[#5d4037]"
                        onSubmit={handleSendMessage}
                    >
                        <div className="flex">
                            <input 
                                type="text" 
                                placeholder="Type a message..." 
                                className="flex-grow p-2 rounded-l-md bg-[#2e2421] border-2 border-[#5d4037] text-[#e8d4b7] focus:outline-none"
                                ref={messageRef}
                                disabled={!isConnected}
                            />
                            <button 
                                type="submit" 
                                className={`px-4 py-2 ${isConnected ? 'bg-[#cb803e] hover:bg-[#b36d2d]' : 'bg-gray-500 cursor-not-allowed'} text-white rounded-r-md transition-colors`}
                                disabled={!isConnected}
                            >
                                Send
                            </button>
                        </div>
                    </form>
                )}
            </div>
            
            {/* YouTube section (2/5 height) */}
            <div className="h-2/5 border-t-4 border-[#5d4037] flex flex-col">
                <div className="bg-[#392e2b] p-2 border-b-2 border-[#5d4037] flex justify-between items-center">
                    <h3 className="font-bold text-[#ffc107] px-2">📺 Watch Together</h3>
                    <div className='h-10'></div>
                </div>
                
                <div className="flex-grow bg-[#2e2421] p-2">
                    <div className="w-full h-full border-4 border-[#5d4037] rounded-lg overflow-hidden">
                        <iframe
                            className="w-full h-full"
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="YouTube video player"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                    </div>
                </div>
            </div>
        </div>
    );
}