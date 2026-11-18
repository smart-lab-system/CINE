

// User function Template for Java
class Solution {
    int missingNumber(int arr[]) {
        // code here
        Arrays.sort(arr);
        int n = arr[arr.length-1];
        int i = 0;
        while (i < n){
            if(arr[i] == i+1){
                i++;
            }else{
                return i+1;
            }
        }
        return n+1;
    }
}