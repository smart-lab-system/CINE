// User function Template for Java

class Solution {
    public List<Integer> singleNumber(int[] arr) {
        // Code here
        int diff = 0;
        for (int num : arr) {
            diff ^= num;
        }

        // Step 2: Isolate the rightmost set bit in diff
        diff &= -diff;

        // Step 3: Divide numbers into two groups and XOR to find unique numbers
        int num1 = 0, num2 = 0;
        for (int num : arr) {
            if ((num & diff) == 0) // If the bit is not set
            {
                num1 ^= num;
            } else // If the bit is set
            {
                num2 ^= num;
            }
        }

        // Step 4: Add numbers to the list in sorted order
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