// User function Template for Java

class Solution {
    public List<Integer> singleNumber(int[] arr) {
        // Code here
        // int xorSum = 0;
        
        // for(int num : arr){
        //     xorSum ^= num;
        // }
        // int rightmostSetBit = 
        int xorSum = 0;
        
        // Step 1: XOR all numbers to get A ^ B
        for (int num : arr) {
            xorSum ^= num;
        }

        // Step 2: Find the rightmost set bit
        int rightmostSetBit = xorSum & -xorSum;

        int num1 = 0, num2 = 0;

        // Step 3: Divide numbers into two groups and XOR separately
        for (int num : arr) {
            if ((num & rightmostSetBit) == 0) {
                num1 ^= num; // Belongs to one group
            } else {
                num2 ^= num; // Belongs to the other group
            }
        }

        // Step 4: Sort and return
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
}