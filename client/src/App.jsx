import{BrowserRouter,Routes,Route,useLocation}from"react-router-dom";
import{WalletProvider}from"./context/WalletContext";import{GameProvider}from"./context/GameContext";import{Header}from"./components";
import WalletModal from"./components/WalletModal";
import Landing from"./pages/Landing";import Home from"./pages/Home";import RandomMatch from"./pages/RandomMatch";import CreateRoom from"./pages/CreateRoom";
import JoinRoom from"./pages/JoinRoom";import GamePlay from"./pages/GamePlay";import Result from"./pages/Result";
import HowToPlay from"./pages/HowToPlay";
function AppContent(){const loc=useLocation();const isLanding=loc.pathname==="/";return<div className="min-h-screen" style={{background:"#07070f"}}>{!isLanding&&<Header/>}<Routes>
  <Route path="/" element={<Landing/>}/>
  <Route path="/arena" element={<Home/>}/>
  <Route path="/match" element={<RandomMatch/>}/>
  <Route path="/create-room" element={<CreateRoom/>}/>
  <Route path="/join-room" element={<JoinRoom/>}/>
  <Route path="/game" element={<GamePlay/>}/>
  <Route path="/result/:id" element={<Result/>}/>
  <Route path="/how-to-play" element={<HowToPlay/>}/>
</Routes><WalletModal/></div>;}
export default function App(){return<WalletProvider><GameProvider><BrowserRouter><AppContent/></BrowserRouter></GameProvider></WalletProvider>;}
