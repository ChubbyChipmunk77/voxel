import { Link } from 'react-router-dom'

function App() {

   return (
      <>
         <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
            <h1 className="text-3xl font-bold mb-8">Welcome to Voxel</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
               <Link
                  to="/game/test"
                  className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
               >
                  <h2 className="text-xl font-semibold mb-2">Join Voice Meeting</h2>
                  <p className="text-gray-600 mb-4">Join a voice meeting room to communicate with others.</p>
                  <div className="text-blue-600 font-medium">Join Meeting →</div>
               </Link>

               <Link
                  to="/game/test"
                  className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition-shadow"
               >
                  <h2 className="text-xl font-semibold mb-2">Join Game Room</h2>
                  <p className="text-gray-600 mb-4">Join a game room to play and interact with others.</p>
                  <div className="text-blue-600 font-medium">Join Game →</div>
               </Link>
            </div>

            <div className="mt-12 text-center">
               <p className="text-gray-500">Create your own room by changing the URL: /game/your-room-name</p>
            </div>
         </div>
      </>
   )
}

export default App
