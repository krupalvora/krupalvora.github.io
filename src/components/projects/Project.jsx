import "./project.css"
import List from "../list/List"
import {projects} from "../../data"
const Project = () => {
    return ( 
        <div id="projects" className='p'>
            <div className="p-texts">
                <h1 className="p-title"> Projects</h1>
{/*                 <p className='p-desc'>Lorem ipsum dolor sit amet consectetur adipisicing elit. Atque error et sed velit accusantium similique voluptas rerum ipsam odit, non perspiciatis deleniti vel aliquam doloremque nulla, blanditiis assumenda, possimus voluptatum a voluptatem.</p>
 */}             </div>
            <div className="p-list">
                {projects.map((item)=>(
                    <List key={item.id} img={item.img} link={item.link} name={item.name}/>
                ))}
            </div>
        </div>
    )
}

export default Project
