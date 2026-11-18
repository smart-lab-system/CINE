// User function Template for Java

class Solution {
    // public List<Integer> singleNumber(int[] arr) {
    //     // Code here
        
        
    // }
    public List<Integer> singleNumber(int[] arr) {
        int xor = 0;

        // Step 1: XOR all elements
        for (int num : arr) {
            xor ^= num;
        }

        // Step 2: Find rightmost set bit in XOR
        int rightmostSetBit = xor & -xor;  // Isolates the rightmost set bit

        int num1 = 0, num2 = 0;

        // Step 3: Split numbers into two groups and XOR separately
        for (int num : arr) {
            if ((num & rightmostSetBit) == 0) {
                num1 ^= num;  // Group where the bit is 0
            } else {
                num2 ^= num;  // Group where the bit is 1
            }
        }

        // Step 4: Return numbers in sorted order
        List<Integer> result = new ArrayList<>();
        if (num1 < num2) {
            result.add(num1);
            result.add(num2);
        } else {
            result.add(num2);
            result.add(num1);
        }

        return result;
}