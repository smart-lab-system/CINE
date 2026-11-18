// User function Template for Java

class Solution {

    public long firstIndex(int arr[]) {
        // Your code goes here
        long ans = -1;
        
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] == 1) {
                ans = i;
                return ans;
            }
        }
        return ans;
    }
}