// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract AcademicCertificateNFT is ERC721, ERC721URIStorage, Ownable, Pausable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    // Institution registration
    struct Institution {
        string name;
        string registrationNumber;
        address institutionAddress;
        bool isVerified;
        uint256 registrationDate;
    }

    // Certificate data structure
    struct Certificate {
        uint256 tokenId;
        string studentName;
        string studentId;
        string courseName;
        string grade;
        string institutionName;
        string certificateType; // "Certificate", "Diploma", "Degree", "Transcript"
        uint256 issueDate;
        uint256 graduationDate;
        string ipfsHash;
        address institutionAddress;
        bool isRevoked;
    }

    // Mappings
    mapping(address => Institution) public institutions;
    mapping(uint256 => Certificate) public certificates;
    mapping(string => bool) public usedStudentIds; // Prevent duplicate certificates
    mapping(address => uint256[]) public institutionCertificates;
    mapping(string => uint256[]) public studentCertificates; // studentId => tokenIds
    
    // Events
    event InstitutionRegistered(address indexed institutionAddress, string name);
    event InstitutionVerified(address indexed institutionAddress);
    event CertificateIssued(
        uint256 indexed tokenId,
        address indexed student,
        address indexed institution,
        string studentName,
        string courseName
    );
    event CertificateRevoked(uint256 indexed tokenId, string reason);
    event CertificateTransferred(uint256 indexed tokenId, address from, address to);

    constructor() ERC721("Academic Certificate NFT", "ACERT") {}

    // Institution management
    function registerInstitution(
        string memory _name,
        string memory _registrationNumber
    ) external {
        require(bytes(_name).length > 0, "Institution name required");
        require(bytes(_registrationNumber).length > 0, "Registration number required");
        require(institutions[msg.sender].institutionAddress == address(0), "Institution already registered");

        institutions[msg.sender] = Institution({
            name: _name,
            registrationNumber: _registrationNumber,
            institutionAddress: msg.sender,
            isVerified: false,
            registrationDate: block.timestamp
        });

        emit InstitutionRegistered(msg.sender, _name);
    }

    function verifyInstitution(address _institutionAddress) external onlyOwner {
        require(institutions[_institutionAddress].institutionAddress != address(0), "Institution not registered");
        institutions[_institutionAddress].isVerified = true;
        emit InstitutionVerified(_institutionAddress);
    }

    // Certificate issuance
    function issueCertificate(
        address _studentAddress,
        string memory _studentName,
        string memory _studentId,
        string memory _courseName,
        string memory _grade,
        string memory _certificateType,
        uint256 _graduationDate,
        string memory _ipfsHash
    ) external whenNotPaused returns (uint256) {
        require(institutions[msg.sender].isVerified, "Institution not verified");
        require(_studentAddress != address(0), "Invalid student address");
        require(bytes(_studentName).length > 0, "Student name required");
        require(bytes(_studentId).length > 0, "Student ID required");
        require(bytes(_courseName).length > 0, "Course name required");
        require(bytes(_ipfsHash).length > 0, "IPFS hash required");
        require(_graduationDate <= block.timestamp, "Invalid graduation date");
        
        // Create unique key for this certificate
        string memory certKey = string(abi.encodePacked(_studentId, _courseName, msg.sender));
        require(!usedStudentIds[certKey], "Certificate already exists for this student and course");

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        // Mint NFT to student
        _safeMint(_studentAddress, tokenId);
        _setTokenURI(tokenId, _ipfsHash);

        // Store certificate data
        certificates[tokenId] = Certificate({
            tokenId: tokenId,
            studentName: _studentName,
            studentId: _studentId,
            courseName: _courseName,
            grade: _grade,
            institutionName: institutions[msg.sender].name,
            certificateType: _certificateType,
            issueDate: block.timestamp,
            graduationDate: _graduationDate,
            ipfsHash: _ipfsHash,
            institutionAddress: msg.sender,
            isRevoked: false
        });

        // Update mappings
        usedStudentIds[certKey] = true;
        institutionCertificates[msg.sender].push(tokenId);
        studentCertificates[_studentId].push(tokenId);

        emit CertificateIssued(tokenId, _studentAddress, msg.sender, _studentName, _courseName);
        return tokenId;
    }

    // Certificate management
    function revokeCertificate(uint256 _tokenId, string memory _reason) external {
        require(_exists(_tokenId), "Certificate does not exist");
        require(certificates[_tokenId].institutionAddress == msg.sender, "Only issuing institution can revoke");
        require(!certificates[_tokenId].isRevoked, "Certificate already revoked");

        certificates[_tokenId].isRevoked = true;
        emit CertificateRevoked(_tokenId, _reason);
    }

    // Verification functions
    function verifyCertificate(uint256 _tokenId) external view returns (
        bool exists,
        bool isRevoked,
        string memory studentName,
        string memory courseName,
        string memory institutionName,
        uint256 issueDate,
        uint256 graduationDate,
        string memory grade
    ) {
        if (!_exists(_tokenId)) {
            return (false, false, "", "", "", 0, 0, "");
        }

        Certificate memory cert = certificates[_tokenId];
        return (
            true,
            cert.isRevoked,
            cert.studentName,
            cert.courseName,
            cert.institutionName,
            cert.issueDate,
            cert.graduationDate,
            cert.grade
        );
    }

    function getCertificatesByStudent(string memory _studentId) external view returns (uint256[] memory) {
        return studentCertificates[_studentId];
    }

    function getCertificatesByInstitution(address _institution) external view returns (uint256[] memory) {
        return institutionCertificates[_institution];
    }

    function isInstitutionVerified(address _institution) external view returns (bool) {
        return institutions[_institution].isVerified;
    }

    // Override functions
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        
        if (from != address(0) && to != address(0)) {
            emit CertificateTransferred(tokenId, from, to);
        }
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // Admin functions
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getTotalCertificates() external view returns (uint256) {
        return _tokenIdCounter.current();
    }

    // Emergency functions
    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}