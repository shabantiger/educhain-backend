// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract CertificateNFT is ERC721URIStorage, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    struct Certificate {
        string studentName;
        string institutionName;
        string courseName;
        string grade;
        uint256 issueDate;
        string ipfsHash;
        bool isValid;
        address issuedBy;
        uint256 completionDate;
        string certificateType;
    }

    struct Institution {
        string name;
        string email;
        bool isAuthorized;
        uint256 registrationDate;
        uint256 certificatesIssued;
    }

    mapping(uint256 => Certificate) public certificates;
    mapping(address => Institution) public institutions;
    mapping(address => uint256[]) public studentCertificates;
    mapping(string => bool) public ipfsHashExists;

    event CertificateIssued(uint256 indexed tokenId, address indexed student, address indexed institution, string courseName, string ipfsHash);
    event InstitutionAuthorized(address indexed institution, string name);
    event InstitutionRevoked(address indexed institution);
    event CertificateRevoked(uint256 indexed tokenId, address indexed revokedBy);

    modifier onlyAuthorizedInstitution() {
        require(institutions[msg.sender].isAuthorized, "Institution not authorized");
        _;
    }

    modifier certificateExists(uint256 tokenId) {
        require(_ownerOf(tokenId) != address(0), "Certificate does not exist");
        _;
    }

   constructor() ERC721("Uganda Academic Certificate", "UGACERT")  {}


    function issueCertificate(
        address student,
        string memory studentName,
        string memory courseName,
        string memory grade,
        string memory ipfsHash,
        uint256 completionDate,
        string memory certificateType
    ) public onlyAuthorizedInstitution nonReentrant returns (uint256) {
        require(student != address(0), "Invalid student address");
        require(bytes(studentName).length > 0, "Student name required");
        require(bytes(courseName).length > 0, "Course name required");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(!ipfsHashExists[ipfsHash], "Duplicate certificate hash");
        require(completionDate <= block.timestamp, "Future completion date");

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        certificates[newTokenId] = Certificate({
            studentName: studentName,
            institutionName: institutions[msg.sender].name,
            courseName: courseName,
            grade: grade,
            issueDate: block.timestamp,
            ipfsHash: ipfsHash,
            isValid: true,
            issuedBy: msg.sender,
            completionDate: completionDate,
            certificateType: certificateType
        });

        ipfsHashExists[ipfsHash] = true;
        studentCertificates[student].push(newTokenId);
        institutions[msg.sender].certificatesIssued++;

        _safeMint(student, newTokenId);
        _setTokenURI(newTokenId, string(abi.encodePacked("ipfs://", ipfsHash)));

        emit CertificateIssued(newTokenId, student, msg.sender, courseName, ipfsHash);

        return newTokenId;
    }

    function batchIssueCertificates(
        address[] memory students,
        string[] memory studentNames,
        string[] memory courseNames,
        string[] memory grades,
        string[] memory ipfsHashes,
        uint256[] memory completionDates,
        string[] memory certificateTypes
    ) external onlyAuthorizedInstitution nonReentrant returns (uint256[] memory) {
        uint256 len = students.length;
        require(
            len == studentNames.length &&
            len == courseNames.length &&
            len == grades.length &&
            len == ipfsHashes.length &&
            len == completionDates.length &&
            len == certificateTypes.length,
            "Input array length mismatch"
        );
        require(len <= 50, "Batch size too large");

        uint256[] memory tokenIds = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            tokenIds[i] = issueCertificate(
                students[i],
                studentNames[i],
                courseNames[i],
                grades[i],
                ipfsHashes[i],
                completionDates[i],
                certificateTypes[i]
            );
        }

        return tokenIds;
    }

    function verifyCertificate(uint256 tokenId)
        external
        view
        certificateExists(tokenId)
        returns (Certificate memory)
    {
        return certificates[tokenId];
    }

    function verifyCertificateByIPFS(string memory ipfsHash)
        external
        view
        returns (bool exists, uint256 tokenId, Certificate memory cert)
    {
        if (!ipfsHashExists[ipfsHash]) {
            return (false, 0, Certificate("", "", "", "", 0, "", false, address(0), 0, ""));
        }

        for (uint256 i = 1; i <= _tokenIds.current(); i++) {
            if (keccak256(bytes(certificates[i].ipfsHash)) == keccak256(bytes(ipfsHash))) {
                return (true, i, certificates[i]);
            }
        }

        return (false, 0, Certificate("", "", "", "", 0, "", false, address(0), 0, ""));
    }

    function getStudentCertificates(address student) external view returns (uint256[] memory) {
        return studentCertificates[student];
    }

    function registerInstitution(string memory name, string memory email) external {
    require(!institutions[msg.sender].isAuthorized, "Already registered");

    institutions[msg.sender] = Institution({
        name: name,
        email: email,
        isAuthorized: true,
        registrationDate: block.timestamp,
        certificatesIssued: 0
    });

    emit InstitutionAuthorized(msg.sender, name);
}
    function revokeInstitution(address institution) external onlyOwner {
        require(institutions[institution].isAuthorized, "Not authorized");
        institutions[institution].isAuthorized = false;
        emit InstitutionRevoked(institution);
    }

    function revokeCertificate(uint256 tokenId) external certificateExists(tokenId) {
        require(
            institutions[msg.sender].isAuthorized || msg.sender == owner(),
            "Not authorized"
        );
        require(
            certificates[tokenId].issuedBy == msg.sender || msg.sender == owner(),
            "Only issuer or owner can revoke"
        );
        certificates[tokenId].isValid = false;
        emit CertificateRevoked(tokenId, msg.sender);
    }

    function updateInstitutionInfo(string memory newName, string memory newEmail) external {
        require(institutions[msg.sender].isAuthorized, "Not authorized");
        require(bytes(newName).length > 0, "Name required");
        institutions[msg.sender].name = newName;
        institutions[msg.sender].email = newEmail;
    }

    function getInstitutionStats(address institution)
        external
        view
        returns (string memory, bool, uint256, uint256)
    {
        Institution memory inst = institutions[institution];
        return (inst.name, inst.isAuthorized, inst.registrationDate, inst.certificatesIssued);
    }

    function getTotalCertificates() external view returns (uint256) {
        return _tokenIds.current();
    }

    // 🔧 Fix: Mark _burn as overrideable and correctly override it
 

   function tokenURI(uint256 tokenId) public view override(ERC721URIStorage) returns (string memory) {
    return super.tokenURI(tokenId);
}

  function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage) returns (bool) {
    return super.supportsInterface(interfaceId);
}




}
