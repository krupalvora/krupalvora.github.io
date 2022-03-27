import "./navbar.css"
const Navbar = () => {
    const myFunction=()=> {
        var x = document.getElementById("myTopnav");
        if (x.className === "topnav") {
          x.className += " responsive";
        } else {
          x.className = "topnav";
        }
      } 
    return (
         <div className="topnav" id="myTopnav">
            <a href="#home" className="active">Home</a>
            <a href="#technologies">Tech Stack</a>
            <a href="#projects">Projects</a>
            <a href="#contact">Contact</a>
            
            <a href="javascript:void(0);" className="icon" onClick={myFunction}>
                <i class="fa fa-bars"></i>
            </a>
        </div> 
    
    )
}

export default Navbar

/* import React, { useState } from "react";
import styled from "styled-components";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Nav>
      <Logo href= "">
        Krupal <span>Vora</span>
      </Logo>
      <Hamburger onClick={() => setIsOpen(!isOpen)}>
        <span />
        <span />
        <span />
      </Hamburger>
      <Menu isOpen={isOpen}>
        <MenuLink href="">Home</MenuLink>
        <MenuLink href="">Skills</MenuLink>
        <MenuLink href="">Projects</MenuLink>
        <MenuLink href="">Contact</MenuLink>
      </Menu>
    </Nav>
  );
};

export default Navbar;

const MenuLink = styled.a`
  padding: 1rem 2rem;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  color: #F8FBFD;
  transition: all 0.3s ease-in;
  font-size: 1.3rem;
  border-bottom: 2px solid transparent;
  border-radius: 2rem;
  font-weight: bold;
  &:hover {
    color: #1199F3;
    border-bottom: 2px solid black;
    background: #F8FBFD;
  }
`;

const Nav = styled.div`
  padding: 0 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  width: 80%;
  margin-left: 10%;
  border-radius: 1.9rem;
  background-color: #7D7F80;
  margin-bottom: 0.7rem;
`;

const Logo = styled.a`
  padding: 1rem 0;
  color: #F8FBFD;
  text-decoration: none;
  font-weight: 800;
  font-size: 1.7rem;
  span {
    font-weight: 500;
    font-size: 1.5rem;
    color: #F8FBFD;
  }
  span:hover {
    color: #1199F3;
  }
  &:hover {
    color: #1199F3;
  }
`;

const Menu = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  @media (max-width: 768px) {
    overflow: hidden;
    flex-direction: column;
    max-height: ${({ isOpen }) => (isOpen ? "500px" : "0")};
    transition: max-height 0.3s ease-in;
    width: 100%;
  }
`;

const Hamburger = styled.div`
  display: none;
  flex-direction: column;
  cursor: pointer;
  span {
    height: 5px;
    width: 25px;
    background: black;
    margin-bottom: 4px;
    border-radius: 5px;
  }
  @media (max-width: 768px) {
    display: flex;
  }
`; */