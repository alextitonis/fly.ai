// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMinimalSY {
    function exchangeRate() external view returns (uint256);
}

/// @title PyIndexHarness
/// @notice Minimal harness modeling Pendle-style monotonic PY index behavior.
/// @dev This is not a full Pendle implementation. It isolates the accounting behavior:
///      pyIndexCurrent = max(SY.exchangeRate(), pyIndexStored).
contract PyIndexHarness {
    uint256 public constant ONE = 1e18;

    IMinimalSY public immutable sy;

    /// @notice Stored PY index, scaled by 1e18.
    uint256 public pyIndexStored;

    constructor(address sy_) {
        require(sy_ != address(0), "zero SY");

        sy = IMinimalSY(sy_);

        uint256 initialRate = sy.exchangeRate();
        require(initialRate >= ONE, "initial rate below one");

        pyIndexStored = initialRate;
    }

    /// @notice Returns the Pendle-style current PY index.
    /// @dev The index is floored by the stored high-water index.
    function pyIndexCurrent() public view returns (uint256) {
        uint256 currentSyRate = sy.exchangeRate();

        if (currentSyRate > pyIndexStored) {
            return currentSyRate;
        }

        return pyIndexStored;
    }

    /// @notice Updates stored PY index if current SY exchangeRate is higher.
    function updatePyIndex() external returns (uint256) {
        uint256 currentIndex = pyIndexCurrent();
        pyIndexStored = currentIndex;
        return currentIndex;
    }

    /// @notice Pure helper for the stress gap between accounting index and current backing.
    function stressGap() external view returns (uint256) {
        uint256 currentSyRate = sy.exchangeRate();

        if (pyIndexStored <= currentSyRate) {
            return 0;
        }

        return pyIndexStored - currentSyRate;
    }

    /// @notice Convert SY amount to PY accounting units using current PY index.
    function syToPY(uint256 syAmount) external view returns (uint256) {
        return (syAmount * pyIndexCurrent()) / ONE;
    }

    /// @notice Convert PY amount back to SY using current PY index, rounding down.
    function pyToSy(uint256 pyAmount) external view returns (uint256) {
        return (pyAmount * ONE) / pyIndexCurrent();
    }
}