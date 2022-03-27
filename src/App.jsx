import About from "./components/about/About";
import Intro from "./components/intro/Intro";
import Contact from "./components/contact/Contact";
import TechStack from "./components/techstack/TechStack";
import Projects from "./components/projects/Project";
import Navbar from "./components/navbar/Navbar";


const App = () => {
  return <div>
 
    <Navbar/>
    <Intro />
    {/* <About /> */}
    <TechStack />
    <Projects />
    <Contact />

  </div>;
};

export default App;