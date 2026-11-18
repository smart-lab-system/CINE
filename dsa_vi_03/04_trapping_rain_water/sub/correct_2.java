

class Solution {
    public int maxWater(int arr[]) {
        // code here
        int n=arr.length;
        int ar1[] = new int[n];
       int ar2[] = new int[n];
       int f=Integer.MIN_VALUE;
        int l=Integer.MIN_VALUE;
        for(int i=0;i<n;i++){
            f=Math.max(arr[i],f);
            ar1[i]=f;
            l=Math.max(arr[n-i-1],l);
            ar2[n-1-i]=l;
        }
        int ans=0;
        for(int i=0;i<n;i++){
            
            ans+=Math.min(ar1[i],ar2[i])-arr[i];
        }
        
        return ans;
    }
}