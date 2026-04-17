// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";

contract BtcPredictArena {
    address public owner;
    IERC20 public usdc;
    uint256 public feeRate = 500;
    uint256 public entryFee = 1e6;
    uint256 public totalFees;
    uint256 public predictionDuration = 30;
    uint256 public predictionBuffer = 5;
    uint256 public refundGracePeriod = 300;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PREDICTION_INTENT_TYPEHASH =
        keccak256("PredictionIntent(uint256 gameId,address player,uint8 prediction,uint256 deadline)");
    bytes32 private constant ROOM_PAYMENT_AUTH_TYPEHASH =
        keccak256("RoomPaymentAuth(bytes32 inviteCodeHash,uint8 maxPlayers,address roomOwner,address player,bytes32 playersHash,uint256 deadline)");
    bytes32 private constant NAME_HASH = keccak256("BtcPredictArena");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1N_DIV_2 =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    enum GameState { Created, Payment, Active, Settled, Cancelled, Refundable }
    enum Prediction { None, Up, Down }

    struct Game {
        uint256 gameId;
        address[] players;
        uint8 maxPlayers;
        GameState state;
        uint256 basePrice;
        uint256 settlementPrice;
        uint256 createdAt;
        uint256 settledAt;
        bool isRoom;
        string inviteCode;
    }

    struct PlayerPrediction {
        Prediction prediction;
        bool hasPaid;
        uint256 reward;
        bool claimed;
    }

    uint256 public nextGameId = 1;
    uint256 private immutable INITIAL_CHAIN_ID;
    bytes32 private immutable INITIAL_DOMAIN_SEPARATOR;

    mapping(uint256 => Game) public games;
    mapping(uint256 => uint256) public gameEntryFee;
    mapping(uint256 => uint256) public gameFeeRate;
    mapping(uint256 => mapping(address => PlayerPrediction)) public playerPredictions;
    mapping(uint256 => uint256) public predictionDeadline;
    mapping(uint256 => address[]) public gamePlayers;
    mapping(string => uint256) public inviteCodeToGame;

    event GameCreated(uint256 indexed gameId, uint8 maxPlayers, bool isRoom, string inviteCode, address creator);
    event PlayerJoined(uint256 indexed gameId, address indexed player);
    event PaymentOpened(uint256 indexed gameId);
    event PlayerPaid(uint256 indexed gameId, address indexed player);
    event GameStarted(uint256 indexed gameId, uint256 basePrice, uint256 predictionDeadline);
    event PredictionMade(uint256 indexed gameId, address indexed player, Prediction prediction);
    event GameSettled(uint256 indexed gameId, uint256 settlementPrice);
    event RewardClaimed(uint256 indexed gameId, address indexed player, uint256 amount);
    event GameCancelled(uint256 indexed gameId);
    event GameRefundable(uint256 indexed gameId);
    event RefundClaimed(uint256 indexed gameId, address indexed player, uint256 amount);
    event FeeWithdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier gameExists(uint256 _gameId) { require(_gameId > 0 && _gameId < nextGameId, "Game not found"); _; }

    constructor(address _usdc) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        INITIAL_CHAIN_ID = block.chainid;
        INITIAL_DOMAIN_SEPARATOR = _buildDomainSeparator();
    }

    function createGame(uint8 _maxPlayers) external returns (uint256) {
        require(_maxPlayers >= 2 && _maxPlayers <= 5, "Invalid team size");
        uint256 gid = _createGame(_maxPlayers, false, "", msg.sender);
        _joinWithoutPayment(gid, msg.sender);
        _openPaymentIfFull(gid);
        return gid;
    }

    function createRoom(uint8 _maxPlayers, string calldata _inviteCode) external returns (uint256) {
        require(_maxPlayers >= 2 && _maxPlayers <= 5, "Invalid team size");
        require(bytes(_inviteCode).length > 0, "Empty invite code");
        require(inviteCodeToGame[_inviteCode] == 0, "Invite code taken");
        uint256 gid = _createGame(_maxPlayers, true, _inviteCode, msg.sender);
        inviteCodeToGame[_inviteCode] = gid;
        _joinWithoutPayment(gid, msg.sender);
        _openPaymentIfFull(gid);
        return gid;
    }

    function createRoomAndPay(
        uint8 _maxPlayers,
        string calldata _inviteCode,
        address[] calldata _players,
        uint256 _deadline,
        bytes calldata _authSignature
    ) external returns (uint256) {
        return _payForReservedRoom(_maxPlayers, _inviteCode, msg.sender, _players, _deadline, _authSignature);
    }

    function ownerCreateGame(uint8 _maxPlayers, address _creator) external onlyOwner returns (uint256) {
        require(_creator != address(0), "Invalid creator");
        require(_maxPlayers >= 2 && _maxPlayers <= 5, "Invalid team size");
        uint256 gid = _createGame(_maxPlayers, false, "", _creator);
        _joinWithoutPayment(gid, _creator);
        _openPaymentIfFull(gid);
        return gid;
    }

    function ownerCreateRoom(uint8 _maxPlayers, string calldata _inviteCode, address _creator) external onlyOwner returns (uint256) {
        require(_creator != address(0), "Invalid creator");
        require(_maxPlayers >= 2 && _maxPlayers <= 5, "Invalid team size");
        require(bytes(_inviteCode).length > 0, "Empty invite code");
        require(inviteCodeToGame[_inviteCode] == 0, "Invite code taken");
        uint256 gid = _createGame(_maxPlayers, true, _inviteCode, _creator);
        inviteCodeToGame[_inviteCode] = gid;
        _joinWithoutPayment(gid, _creator);
        _openPaymentIfFull(gid);
        return gid;
    }

    function joinGame(uint256 _gameId) external gameExists(_gameId) {
        Game storage g = games[_gameId];
        require(!g.isRoom, "Use joinRoom");
        require(g.state == GameState.Created, "Game not joinable");
        _joinWithoutPayment(_gameId, msg.sender);
        _openPaymentIfFull(_gameId);
    }

    function joinRoom(string calldata _inviteCode) external {
        uint256 gid = inviteCodeToGame[_inviteCode];
        require(gid > 0, "Room not found");
        Game storage g = games[gid];
        require(g.state == GameState.Created, "Room not joinable");
        _joinWithoutPayment(gid, msg.sender);
        _openPaymentIfFull(gid);
    }

    function joinRoomAndPay(
        string calldata _inviteCode,
        uint8 _maxPlayers,
        address _roomOwner,
        address[] calldata _players,
        uint256 _deadline,
        bytes calldata _authSignature
    ) external returns (uint256) {
        return _payForReservedRoom(_maxPlayers, _inviteCode, _roomOwner, _players, _deadline, _authSignature);
    }

    function ownerJoinGame(uint256 _gameId, address _player) external onlyOwner gameExists(_gameId) {
        require(_player != address(0), "Invalid player");
        Game storage g = games[_gameId];
        require(!g.isRoom, "Use ownerJoinRoom");
        require(g.state == GameState.Created, "Game not joinable");
        _joinWithoutPayment(_gameId, _player);
        _openPaymentIfFull(_gameId);
    }

    function ownerJoinRoom(string calldata _inviteCode, address _player) external onlyOwner {
        require(_player != address(0), "Invalid player");
        uint256 gid = inviteCodeToGame[_inviteCode];
        require(gid > 0, "Room not found");
        Game storage g = games[gid];
        require(g.state == GameState.Created, "Room not joinable");
        _joinWithoutPayment(gid, _player);
        _openPaymentIfFull(gid);
    }

    function payForGame(uint256 _gameId) external gameExists(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.Payment, "Payment not open");
        require(_isPlayer(_gameId, msg.sender), "Not a player");
        _collectPayment(_gameId, msg.sender);
    }

    function startGame(uint256 _gameId, uint256 _basePrice) external onlyOwner gameExists(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.Payment, "Not in payment state");
        require(g.players.length == g.maxPlayers, "Not enough players");
        require(allPlayersPaid(_gameId), "Players not fully paid");
        require(_basePrice > 0, "Invalid price");
        require(predictionDuration > predictionBuffer, "Invalid prediction window");
        g.state = GameState.Active;
        g.basePrice = _basePrice;
        predictionDeadline[_gameId] = block.timestamp + (predictionDuration - predictionBuffer);
        emit GameStarted(_gameId, _basePrice, predictionDeadline[_gameId]);
    }

    function predict(uint256 _gameId, Prediction _prediction) external gameExists(_gameId) {
        _submitPrediction(_gameId, msg.sender, _prediction);
    }

    function submitPredictionBySig(
        uint256 _gameId,
        address _player,
        Prediction _prediction,
        uint256 _deadline,
        bytes calldata _signature
    ) external gameExists(_gameId) {
        require(_deadline == predictionDeadline[_gameId], "Invalid deadline");
        bytes32 structHash = keccak256(abi.encode(
            PREDICTION_INTENT_TYPEHASH,
            _gameId,
            _player,
            uint8(_prediction),
            _deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        address signer = _recoverSigner(digest, _signature);
        require(signer == _player, "Invalid signature");
        _submitPrediction(_gameId, _player, _prediction);
    }

    function settleGame(uint256 _gameId, uint256 _settlementPrice) external onlyOwner gameExists(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.Active, "Game not active");
        require(_settlementPrice > 0, "Invalid price");
        g.state = GameState.Settled;
        g.settlementPrice = _settlementPrice;
        g.settledAt = block.timestamp;

        bool isUp = _settlementPrice > g.basePrice;
        bool isFlat = _settlementPrice == g.basePrice;

        uint256 winnerCount = 0;
        uint256 loserCount = 0;
        address[] memory winners = new address[](g.players.length);

        for (uint256 i = 0; i < g.players.length; i++) {
            address p = g.players[i];
            PlayerPrediction storage pp = playerPredictions[_gameId][p];
            if (isFlat) {
                winners[winnerCount++] = p;
                continue;
            }
            if (pp.prediction == Prediction.None) {
                loserCount++;
                continue;
            }
            bool correct = (isUp && pp.prediction == Prediction.Up) || (!isUp && pp.prediction == Prediction.Down);
            if (correct) winners[winnerCount++] = p;
            else loserCount++;
        }

        uint256 entryFeeForGame = gameEntryFee[_gameId];
        uint256 feeRateForGame = gameFeeRate[_gameId];
        uint256 feePerPlayer = (entryFeeForGame * feeRateForGame) / 10000;
        uint256 netPerPlayer = entryFeeForGame - feePerPlayer;
        totalFees += feePerPlayer * g.players.length;

        if (isFlat || winnerCount == g.players.length || winnerCount == 0) {
            for (uint256 i = 0; i < g.players.length; i++) {
                playerPredictions[_gameId][g.players[i]].reward = netPerPlayer;
            }
        } else {
            uint256 loserPool = loserCount * netPerPlayer;
            uint256 winnerBonus = loserPool / winnerCount;
            for (uint256 i = 0; i < winnerCount; i++) {
                playerPredictions[_gameId][winners[i]].reward = netPerPlayer + winnerBonus;
            }
            uint256 remainder = loserPool - (winnerBonus * winnerCount);
            if (remainder > 0) totalFees += remainder;
        }

        emit GameSettled(_gameId, _settlementPrice);
    }

    function claimReward(uint256 _gameId) external gameExists(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.Settled, "Not settled");
        PlayerPrediction storage pp = playerPredictions[_gameId][msg.sender];
        require(pp.hasPaid, "Not a participant");
        require(!pp.claimed, "Already claimed");
        require(pp.reward > 0, "No reward");
        pp.claimed = true;
        require(usdc.transfer(msg.sender, pp.reward), "Transfer failed");
        emit RewardClaimed(_gameId, msg.sender, pp.reward);
    }

    function forceRefund(uint256 _gameId) external gameExists(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.Active, "Game not active");
        uint256 deadline = predictionDeadline[_gameId];
        require(deadline > 0, "Prediction deadline unavailable");
        require(block.timestamp > deadline + refundGracePeriod, "Refund not available yet");
        g.state = GameState.Refundable;
        emit GameRefundable(_gameId);
    }

    function claimRefund(uint256 _gameId) external gameExists(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.Refundable, "Not refundable");
        PlayerPrediction storage pp = playerPredictions[_gameId][msg.sender];
        require(pp.hasPaid, "Not a participant");
        require(!pp.claimed, "Already claimed");
        uint256 refundAmount = gameEntryFee[_gameId];
        require(refundAmount > 0, "No refund");
        pp.claimed = true;
        require(usdc.transfer(msg.sender, refundAmount), "Transfer failed");
        emit RefundClaimed(_gameId, msg.sender, refundAmount);
    }

    function cancelGame(uint256 _gameId) external onlyOwner gameExists(_gameId) {
        Game storage g = games[_gameId];
        require(g.state == GameState.Created || g.state == GameState.Payment, "Cannot cancel now");
        g.state = GameState.Cancelled;
        uint256 refundAmount = gameEntryFee[_gameId];
        for (uint256 i = 0; i < g.players.length; i++) {
            address p = g.players[i];
            if (playerPredictions[_gameId][p].hasPaid) {
                require(usdc.transfer(p, refundAmount), "Refund failed");
            }
        }
        if (bytes(g.inviteCode).length > 0) delete inviteCodeToGame[g.inviteCode];
        emit GameCancelled(_gameId);
    }

    function allPlayersPaid(uint256 _gameId) public view returns (bool) {
        Game storage g = games[_gameId];
        if (g.players.length != g.maxPlayers) return false;
        for (uint256 i = 0; i < g.players.length; i++) {
            if (!playerPredictions[_gameId][g.players[i]].hasPaid) return false;
        }
        return true;
    }

    function domainSeparator() public view returns (bytes32) {
        return block.chainid == INITIAL_CHAIN_ID ? INITIAL_DOMAIN_SEPARATOR : _buildDomainSeparator();
    }

    function withdrawFees(address _to) external onlyOwner {
        uint256 amount = totalFees;
        require(amount > 0, "No fees");
        totalFees = 0;
        require(usdc.transfer(_to, amount), "Transfer failed");
        emit FeeWithdrawn(_to, amount);
    }

    function setFeeRate(uint256 _feeRate) external onlyOwner { require(_feeRate <= 1000, "Fee too high"); feeRate = _feeRate; }
    function setEntryFee(uint256 _entryFee) external onlyOwner { entryFee = _entryFee; }
    function setRefundGracePeriod(uint256 _refundGracePeriod) external onlyOwner { require(_refundGracePeriod > 0, "Invalid grace period"); refundGracePeriod = _refundGracePeriod; }

    function getGamePlayers(uint256 _gameId) external view returns (address[] memory) { return games[_gameId].players; }

    function getGameInfo(uint256 _gameId) external view returns (
        uint256 gameId, uint8 maxPlayers, GameState state, uint256 playerCount,
        uint256 basePrice, uint256 settlementPrice, bool isRoom, string memory inviteCode
    ) {
        Game storage g = games[_gameId];
        return (g.gameId, g.maxPlayers, g.state, uint256(g.players.length), g.basePrice, g.settlementPrice, g.isRoom, g.inviteCode);
    }

    function getPlayerPrediction(uint256 _gameId, address _player) external view returns (
        Prediction prediction, bool hasPaid, uint256 reward, bool claimed
    ) {
        PlayerPrediction storage pp = playerPredictions[_gameId][_player];
        return (pp.prediction, pp.hasPaid, pp.reward, pp.claimed);
    }

    function _createGame(uint8 _maxPlayers, bool _isRoom, string memory _inviteCode, address creator) internal returns (uint256) {
        uint256 gid = nextGameId++;
        Game storage g = games[gid];
        g.gameId = gid;
        g.maxPlayers = _maxPlayers;
        g.state = GameState.Created;
        g.createdAt = block.timestamp;
        g.isRoom = _isRoom;
        g.inviteCode = _inviteCode;
        gameEntryFee[gid] = entryFee;
        gameFeeRate[gid] = feeRate;
        emit GameCreated(gid, _maxPlayers, _isRoom, _inviteCode, creator);
        return gid;
    }

    function _joinWithoutPayment(uint256 _gameId, address player) internal {
        Game storage g = games[_gameId];
        require(g.players.length < g.maxPlayers, "Game full");
        require(!_isPlayer(_gameId, player), "Already joined");
        g.players.push(player);
        gamePlayers[_gameId].push(player);
        emit PlayerJoined(_gameId, player);
    }

    function _openPaymentIfFull(uint256 _gameId) internal {
        Game storage g = games[_gameId];
        if (g.players.length == g.maxPlayers) {
            g.state = GameState.Payment;
            emit PaymentOpened(_gameId);
        }
    }

    function _collectPayment(uint256 _gameId, address player) internal {
        PlayerPrediction storage pp = playerPredictions[_gameId][player];
        require(!pp.hasPaid, "Already paid");
        uint256 paymentAmount = gameEntryFee[_gameId];
        require(usdc.transferFrom(player, address(this), paymentAmount), "Payment failed");
        pp.hasPaid = true;
        emit PlayerPaid(_gameId, player);
    }

    function _payForReservedRoom(
        uint8 _maxPlayers,
        string calldata _inviteCode,
        address _roomOwner,
        address[] calldata _players,
        uint256 _deadline,
        bytes calldata _authSignature
    ) internal returns (uint256) {
        require(_maxPlayers >= 2 && _maxPlayers <= 5, "Invalid team size");
        require(bytes(_inviteCode).length > 0, "Empty invite code");
        require(_roomOwner != address(0), "Invalid creator");
        _assertRoomRoster(_maxPlayers, _roomOwner, msg.sender, _players);
        _verifyRoomPaymentAuth(_inviteCode, _maxPlayers, _roomOwner, msg.sender, _players, _deadline, _authSignature);

        uint256 gid = inviteCodeToGame[_inviteCode];
        if (gid == 0) {
            gid = _createGame(_maxPlayers, true, _inviteCode, _roomOwner);
            inviteCodeToGame[_inviteCode] = gid;
        } else {
            Game storage existing = games[gid];
            require(existing.isRoom, "Room not found");
            require(existing.maxPlayers == _maxPlayers, "Room size mismatch");
            require(existing.state == GameState.Created || existing.state == GameState.Payment, "Room not joinable");
        }

        if (!_isPlayer(gid, msg.sender)) {
            Game storage g = games[gid];
            require(g.state == GameState.Created || g.state == GameState.Payment, "Room not joinable");
            _joinWithoutPayment(gid, msg.sender);
            _openPaymentIfFull(gid);
        }

        _collectPayment(gid, msg.sender);
        _openPaymentIfFull(gid);
        return gid;
    }

    function _assertRoomRoster(
        uint8 _maxPlayers,
        address _roomOwner,
        address _player,
        address[] calldata _players
    ) internal pure {
        require(_players.length == _maxPlayers, "Roster mismatch");
        bool ownerIncluded = false;
        bool playerIncluded = false;
        for (uint256 i = 0; i < _players.length; i++) {
            address current = _players[i];
            require(current != address(0), "Invalid player");
            if (current == _roomOwner) ownerIncluded = true;
            if (current == _player) playerIncluded = true;
        }
        require(ownerIncluded, "Owner not in room");
        require(playerIncluded, "Player not in room");
    }

    function _verifyRoomPaymentAuth(
        string calldata _inviteCode,
        uint8 _maxPlayers,
        address _roomOwner,
        address _player,
        address[] calldata _players,
        uint256 _deadline,
        bytes calldata _authSignature
    ) internal view {
        require(block.timestamp <= _deadline, "Payment authorization expired");
        bytes32 structHash = keccak256(abi.encode(
            ROOM_PAYMENT_AUTH_TYPEHASH,
            keccak256(bytes(_inviteCode)),
            _maxPlayers,
            _roomOwner,
            _player,
            keccak256(abi.encodePacked(_players)),
            _deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        address signer = _recoverSigner(digest, _authSignature);
        require(signer == owner, "Invalid room payment auth");
    }

    function _submitPrediction(uint256 _gameId, address _player, Prediction _prediction) internal {
        Game storage g = games[_gameId];
        require(g.state == GameState.Active, "Game not active");
        require(_isPlayer(_gameId, _player), "Not a player");
        require(_prediction == Prediction.Up || _prediction == Prediction.Down, "Invalid prediction");
        require(block.timestamp <= predictionDeadline[_gameId], "Prediction window closed");
        PlayerPrediction storage pp = playerPredictions[_gameId][_player];
        require(pp.hasPaid, "Payment required");
        require(pp.prediction == Prediction.None, "Already predicted");
        pp.prediction = _prediction;
        emit PredictionMade(_gameId, _player, _prediction);
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            NAME_HASH,
            VERSION_HASH,
            block.chainid,
            address(this)
        ));
    }

    function _recoverSigner(bytes32 _digest, bytes calldata _signature) private pure returns (address) {
        require(_signature.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(_signature.offset)
            s := calldataload(add(_signature.offset, 32))
            v := byte(0, calldataload(add(_signature.offset, 64)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid signature v");
        require(uint256(s) <= SECP256K1N_DIV_2, "Invalid signature s");
        address signer = ecrecover(_digest, v, r, s);
        require(signer != address(0), "Invalid signature");
        return signer;
    }

    function _isPlayer(uint256 _gameId, address _addr) internal view returns (bool) {
        address[] storage players = games[_gameId].players;
        for (uint256 i = 0; i < players.length; i++) {
            if (players[i] == _addr) return true;
        }
        return false;
    }
}
