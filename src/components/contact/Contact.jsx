import "./contact.css";
import Phone from "../../img/phone.png";
import Email from "../../img/email.png";
import linkedin from "../../img/linkedin.png";
import git1 from "../../img/git1.png";
import Address from "../../img/address.png";
import { useRef } from "react";
import emailjs from 'emailjs-com';
import React, { useState } from "react";
/* import { Form ,Button } from 'react-bootstrap';
 */const Contact = () => {
    const formRef = useRef()
    const [done, setDone] = useState(false)
    const handlesubmit = (e) => {
        e.preventDefault();
        emailjs.sendForm('service_k2yfunv', 'template_ql040ja', formRef.current, 'user_WyZpGSxMESF3ZBZsDv64D')
            .then((result) => {
                console.log(result.text);
                setDone(true)
            }, (error) => {
                console.log(error.text);
            });
    }
    return (
        <div id="contact" className="c">
            <div className="c-bg"></div>
            <div className="c-wrapper">
                <div className="c-left">
                    <h1 className="c-title"> Connect With Me</h1>
                    <div className="c-info">
                        <div className="c-info-item">
                            <img src={Phone}
                                alt="contact" className="c-icon" />
                            +91 8104409285
                        </div>
                        <div className="c-info-item">
                            <img src={Email}
                                alt="Email" className="c-icon" />
                            <a className="c-a" rel="noreferrer" target="_blank" href="mailto:krupalvora789@gmail.com">krupalvora789@gmail.com</a>

                        </div>
                        <div className="c-info-item">
                            <img src={Address}
                                alt="Email" className="c-icon" />
                            Mumbai, India.
                        </div>
                        <div className="c-info-item">
                            <img src={linkedin}
                                alt="Email" className="c-icon" />
                            <a className="c-a" rel="noreferrer" target="_blank" href="https://www.linkedin.com/in/krupal-vora-69b332204/">LinkedIn</a>
                        </div>
                        <div className="c-info-item">
                            <img src={git1}
                                alt="Email" className="c-icon" />
                            <a className="c-a" rel="noreferrer" target="_blank" href="https://github.com/krupalvora">GitHub</a>
                        </div>
                    </div>
                </div>
                <div className="c-right">
                    <p className="c-desc">
                        <b>What's your story?</b> Get in touch with me.
                    </p>

                    <form className="c-form" ref={formRef} onSubmit={handlesubmit}>
                        <input className="c-input" type="text" placeholder="Name" name="user_name" />
                        <input className="c-input" type="text" placeholder="Email" name="user_email" />
                        <input  className="c-input"type="text" placeholder="Subject" name="user_subject" />
                        <textarea className="c-textarea" name="message"  placeholder ="Message" rows="5"></textarea>
                        <button className="c-button">Submit</button>
                        {done && "Thank you ... message sent successfully"}
                    </form>
                </div>
            </div>
            <p className="c-copy">Copyright  &copy; krupalvora.github.io </p> 
        </div>
    )
}

export default Contact
