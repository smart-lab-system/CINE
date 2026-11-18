



class Solution {
    public int trappingWater(int arr[]) {
        int n = arr.length;
        int[] leftMax = new int[n];
        int[] rightMax = new int[n];
    
        // Compute leftMax
        leftMax[0] = arr[0];
        for (int i = 1; i < n; i++) {
            leftMax[i] = Math.max(leftMax[i - 1], arr[i]);
        }
    
        // Compute rightMax
        rightMax[n - 1] = arr[n - 1];
        for (int i = n - 2; i >= 0; i--) {
            rightMax[i] = Math.max(rightMax[i + 1], arr[i]);
        }
    
        // Compute the total trapped water
        int res = 0;
        for (int i = 1; i < n - 1; i++) {
            res += Math.min(leftMax[i], rightMax[i]) - arr[i];
        }
    
        return res;
    }

}