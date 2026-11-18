// User function Template for Java

class Solution {

    public long firstIndex(int arr[]) {
        
        int len = arr.length;
        
        if(arr[len-1] == 0) {
            return -1;
        }
        
        for(int i=0;i<len;i++) {
            if(arr[i] == 1) {
                return i;
            }
        }
        
        return -1;
    }
}