import "./list.css"
const List = ({img,link}) => {
    return (
        <div className='pl'>
           <div className="pl-browser">
               <div className="pl-circle"></div>
               <div className="pl-circle"></div>
               <div className="pl-circle"></div>
           </div>
           <a href={link} target="_blank" rel="noreferrer">
            <img src={img} alt="" className="pl-img" />
           </a>
        </div>
    )
}

export default List
