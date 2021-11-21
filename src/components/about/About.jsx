import "./about.css"
import about from "../../img/about.svg"

const About = () => {
    return (
        <div id="about" className='a'>
            <div className="a-left">
                <div className="a-card bg"></div>
                <div className="a-card">
                    <img src={about} alt="about" className='a-img' />
                </div>
            </div>
            <div className="a-right">
                <h1 className="a-title">About Me</h1>
                <p className='a-sub'>Myself krupal vinod vora, I am  tech enthustic and always eager to learn new things.</p>
                <p className='a-sub'>To deliver quality products and services to the community with a synergistic attitude. Looking for a dynamic
                    and progressive company where my skills are utilized in the maximum way possible. Learning new
                    technologies throughout life for the progress of the community and myself.</p>
                <br /><a href="https://drive.google.com/file/d/12r0XVjXK2aMwwYsyQqJZZKKS2ehf419F/view?usp=sharing" rel="noreferrer" target="_blank"><button className="a-button">Resume</button></a>
            </div>
        </div>
    )
}

export default About
