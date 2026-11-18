
class Solution {
    public int findUnique(int k, int[] arr) {
        // code here
        Arrays.sort(arr);
        int n = arr.length;

        for (int i = 0; i < n; i += k) { // Step 2: Iterate in steps of k
            if (i == n - 1 || arr[i] != arr[i + 1]) {
                return arr[i]; // Step 3: Return the unique element
            }
        }

        return -1; // If no unique element is found
   }
}