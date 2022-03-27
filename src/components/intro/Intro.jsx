import "./intro.css"
import profile from "../../img/profile-2.png"



const intro = () => {
    return (
        <div id="home" className="intro">
            <div className="intro-left">
                <div className="intro-left-wrapper">
                    <h2 className="intro-intro">Hello, MySelf </h2>
                    <h1 className="intro-name">Krupal Vora </h1>
                    <div className="intro-title">
                        <div className="intro-title-wrapper">
                            <div className="intro-title-item">Student</div>
                            <div className="intro-title-item">Programmer</div>
                            <div className="intro-title-item">Web Developer</div>
                            <div className="intro-title-item">Android Developer</div>
                        </div>
                    </div>
                    <p className="intro-desc">
                        <div className="div">I am  tech enthustic and always eager to learn new things.</div>
                        To deliver quality products and services to the community with a synergistic attitude. Looking for a dynamic
                        and progressive company where my skills are utilized in the maximum way possible. Learning new
                        technologies throughout life for the progress of the community and myself.
                        <br /><a href="https://drive.google.com/file/d/12r0XVjXK2aMwwYsyQqJZZKKS2ehf419F/view?usp=sharing" rel="noreferrer" target="_blank"><button className="a-button">Resume</button></a>
                    </p>

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
