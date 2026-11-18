class Solution {
    public static int longestSubarray(int[] arr, int k) {
        int n = arr.length;
        int[] prefix = new int[n + 1]; // Prefix sum array (1-based indexing)

        // Compute prefix sum
        for (int i = 0; i < n; i++) {
            prefix[i + 1] = prefix[i] + arr[i];
        }

        int maxLen = 0;

        // Check all subarrays using prefix sum
        for (int i = 0; i < n; i++) {
            for (int j = i; j < n; j++) {
                int sum = prefix[j + 1] - prefix[i]; // Sum of subarray (i to j)

                if (sum == k) {
                    maxLen = Math.max(maxLen, j - i + 1);
                }
            }
        }

        return maxLen;
    }

    public static void main(String[] args) {
        int arr[] = {10, 5, 2, 7, 1, -10};
        int k = 15;
        int len = longestSubarray(arr, k);
        System.out.println("Length of longest subarray is: " + len);
    }
}

    