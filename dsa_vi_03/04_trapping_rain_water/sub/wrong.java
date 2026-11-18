

class Solution {
    public int maxWater(int arr[]) {
        if(arr.length<=2) return 0;
        
        int l = 0;
        int r = arr.length-1;
        
        int maxWat = 0;
        
        while(l<=r){
            // int w = r-l;
            int h = Math.min(arr[l],arr[r]);
            
            int area = h;
            maxWat+=area;
            
            if(arr[l]<arr[r]){
                l++;
            }
            else{
                r--;
            }
        }
        return maxWat;
    }
}