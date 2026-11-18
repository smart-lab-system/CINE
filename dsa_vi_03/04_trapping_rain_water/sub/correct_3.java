

class Solution {
    public int maxWater(int arr[]) {
        // code here
        int n = arr.length;
        int[] maxL = new int[n];
        int[] maxR = new int[n];
        int[] water = new int[n];
        
        int currLeftMax = arr[0];
        maxL[0] = currLeftMax;
        int currRightMax = arr[n-1];
        maxR[n-1] = arr[n-1];
        
        for(int i=1;i<n;i++) {
            currLeftMax = Math.max(currLeftMax, arr[i]);
            maxL[i] = currLeftMax;
        }
        
        for(int i=n-1;i>=0;i--) {
            currRightMax = Math.max(currRightMax, arr[i]);
            maxR[i] = currRightMax;
        }
        
        int area = 0;
        for(int i=0;i<n;i++) {
            water[i] = Math.min(maxL[i],maxR[i])-arr[i];
            area = area + water[i];
        }
        return area;
    }
}