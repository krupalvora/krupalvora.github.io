import "./intro.css"
import profile from "../../img/profile-2.png"



const intro = () => {
    return (
        <div className="intro">
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
                    It should briefly present the main ideas in the original text. The introduction should include the name of the author, the title of their work, and some background information about the author, if needed. In the main body paragraphs, state the ideas you've chosen while reading the text
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
