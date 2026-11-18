public class Solution {
    // Function to find the last index of '1' in a string
    public int lastIndex(String s) {
        boolean flag = false; // To track if '1' is found
        int n = s.length();   // Length of the string
        for (int i = n - 1; i >= 0; i--) {
            if (s.charAt(i) == '1') {
                flag = true; // '1' found, set flag to true
                return i;    // Return the last index of '1'
            }
        }

        // If '1' is not found, return -1
        if (!flag) {
            return -1;
        }

        return -1; // Added to ensure the method always returns an int
    }
}