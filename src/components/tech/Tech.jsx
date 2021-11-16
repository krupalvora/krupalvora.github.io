import "./tech.css"
const Tech = ({img,link}) => {
    return (
        <div className='tl'>
           <a href={link} target="_blank" rel="noreferrer">
            <img src={img} alt="" className="tl-img" />
           </a>
        </div>
    )
}

export default Tech
