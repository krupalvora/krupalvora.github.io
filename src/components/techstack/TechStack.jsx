import "./techstack.css"
import Tech from "../tech/Tech"
import Tech1 from "../tech1/Tech1"
import { tech } from "../../data1"
import { tech2 } from "../../data2"
const TechStack = () => {
    return (
        <div id="technologies" className='t'>
            <div className="t-texts">
                <h1 className="t-title"> Technologies</h1>
            </div>
            <div className="t-list">
                {tech.map((item) => (
                    <Tech key={item.id} img={item.img} link={item.link} />
                ))}
            </div>
            <div className="t2-list">
            {tech2.map((item) => (
                    <Tech1 key={item.id} img={item.img} link={item.link} />
                ))}
            </div> 
        </div>
    )
}

export default TechStack
