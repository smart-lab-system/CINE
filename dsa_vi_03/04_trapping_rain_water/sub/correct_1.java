

class Solution {
    public int maxWater(int arr[]) {
        // code here
        int n=arr.length;
        int left[]=new int[n];
        int right[]=new int[n];
        right[n-1]=0;
        left[0]=0;
        for(int i=1,j=n-2;i<n && j>=0;i++,j--){
            left[i]=Math.max(left[i-1],arr[i-1]);
            right[j]=Math.max(right[j+1],arr[j+1]);
        }
    /*    System.out.println(Arrays.toString(left));
        System.out.println(Arrays.toString(right));
        System.out.println(Arrays.toString(arr));*/
        
        int water=0;
        for(int i=1;i<n-1;i++){
           if((Math.min(left[i],right[i]))>arr[i]){
               water=water + ((Math.min(left[i],right[i]))-arr[i]);
           }   
        }
        return water;
    }
}