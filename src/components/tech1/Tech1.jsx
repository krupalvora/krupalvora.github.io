import "./tech1.css"
const Tech1 = ({img,link}) => {
    return (
        <div className='t2'>
           <a href={link} target="_blank" rel="noreferrer">
            <img src={img} alt="" className="t2-img" />
           </a>
        </div>
    )
}

export default Tech1
