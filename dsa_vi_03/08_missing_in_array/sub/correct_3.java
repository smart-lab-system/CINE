

// User function Template for Java
class Solution {
    int missingNumber(int arr[]) {
        // code here
        
         int n = arr.length + 1; // The array is missing one number, so n = arr.length + 1
        long totalSum = (long) n * (n + 1) / 2; // Use long to prevent overflow

        long arraySum = 0;
        for (int num : arr) {
            arraySum += num; // Sum of array elements
        }

        return (int) (totalSum - arraySum); // Cast result back to int
    }
}