import java.util.*;

class Solution {
    public static int longestSubarray(int[] arr, int k) {
        Map<Integer, Integer> prefixSumMap = new HashMap<>();
        int currSum = 0, maxLen = 0;

        for (int i = 0; i < arr.length; i++) {
            currSum += arr[i];

            // If subarray starts from index 0
            if (currSum == k) {
                maxLen = i + 1;
            }

            // Check if removing a previous sum results in sum k
            if (prefixSumMap.containsKey(currSum - k)) {
                maxLen = Math.max(maxLen, i - prefixSumMap.get(currSum - k));
            }

            // Store the first occurrence of currSum
            if (!prefixSumMap.containsKey(currSum)) {
                prefixSumMap.put(currSum, i);
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


    