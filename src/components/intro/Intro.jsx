import "./intro.css"
import profile from "../../img/profile-2.png"


const intro = () => {
    return (
        <div id="home" className="intro">
            <div className="intro-left">
                <div className="intro-left-wrapper">
                    <h2 className="intro-intro">Hello, MySelf</h2>
                    <h1 className="intro-name">Krupal Vora </h1>
                    <div className="intro-title">
                        <div className="intro-title-wrapper">
                            <div className="intro-title-item">Student</div>
                            <div className="intro-title-item">Python Enthusiast</div>
                            <div className="intro-title-item">Programmer</div>
                            <div className="intro-title-item">Web Developer</div>
                            <div className="intro-title-item">Python Enthusiast</div>
                        </div>
                    </div>
                    <p className="intro-desc">
                        <div className="div">I am  tech enthusiast and always being eager to learn new things.</div>
                        I love to solve real life problems using my technical skills.
{/*                         <br /><a href="https://drive.google.com/file/d/12r0XVjXK2aMwwYsyQqJZZKKS2ehf419F/view?usp=sharing" rel="noreferrer" target="_blank"><button className="a-button">Resume</button></a>
 */}                    </p>

                </div>
            </div>
            <div className="intro-right">
                <div className="intro-bg"></div>
                <img src={profile} alt="krupal vora" className='intro-img' />
            </div>
        </div>
    )
}

export default intro
