import "./list.css"
const List = ({img,link,name}) => {
    return (
        <div className='pl'>
           <div className="pl-browser">
               <div className="pl-circle"></div>
               <div className="pl-circle"></div>
               <div className="pl-circle"></div>
           </div>
           <a  className="pl-title" href={link} target="_blank" rel="noreferrer">
            <img src={img} alt="" className="pl-img" />
           <p >{name}</p></a>
        </div>
    )
}

export default List
