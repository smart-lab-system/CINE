

// User function Template for Java
class Solution {
    int missingNumber(int arr[]) {
        Arrays.sort(arr);
        for(int i=0;i<arr.length;i++){
            if(arr[i]!=i+1){
                return i+1;
            }
        }
        return 0;
    }
}