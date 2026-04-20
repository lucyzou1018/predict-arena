import{BrowserRouter,Routes,Route,useLocation}from"react-router-dom";
import{WalletProvider}from"./context/WalletContext";import{GameProvider}from"./context/GameContext";import{LangProvider}from"./context/LangContext";import{Header,Footer}from"./components";
import WalletModal from"./components/WalletModal";
import Landing from"./pages/Landing";import Home from"./pages/Home";import RandomMatch from"./pages/RandomMatch";import CreateRoom from"./pages/CreateRoom";
import JoinRoom from"./pages/JoinRoom";import GamePlay from"./pages/GamePlay";import Result from"./pages/Result";
import HowToPlay from"./pages/HowToPlay";
import Login from"./pages/Login";
import Sparkles from"./components/Sparkles";
function AppContent(){const loc=useLocation();const hideHeader=loc.pathname==="/";const showFooter=["/","/arena","/how-to-play","/login"].includes(loc.pathname);return<div className="min-h-screen relative app-bg flex flex-col"><Sparkles/>{!hideHeader&&<Header/>}<div className="flex-1"><Routes>
  <Route path="/" element={<Landing/>}/>
  <Route path="/login" element={<Login/>}/>
  <Route path="/arena" element={<Home/>}/>
  <Route path="/match" element={<RandomMatch/>}/>
  <Route path="/create-room" element={<CreateRoom/>}/>
  <Route path="/join-room" element={<JoinRoom/>}/>
  <Route path="/game" element={<GamePlay/>}/>
  <Route path="/result/:id" element={<Result/>}/>
  <Route path="/how-to-play" element={<HowToPlay/>}/>
</Routes></div>{showFooter&&<Footer/>}<WalletModal/></div>;}
export default function App(){return<LangProvider><WalletProvider><GameProvider><BrowserRouter><AppContent/></BrowserRouter></GameProvider></WalletProvider></LangProvider>;}
